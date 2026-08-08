import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';
import { config } from '../config.ts';
import { can, type AuthedUser } from '../auth.ts';
import { getProvider, providerConfigStatus } from '../email/index.ts';
import {
  listAccounts,
  startConnect,
  completeConnect,
  testConnection,
  disconnectAccount,
  setDefaultAccount,
  sendOutreachMessage,
  getEmailSafety,
  SafetyGateError,
} from '../email/accounts.ts';
import { pollAccountForReplies } from '../email/replies.ts';
import type { EmailProviderKind } from '../email/types.ts';

function requireUser(req: any): AuthedUser {
  const user = req.user as AuthedUser | undefined;
  if (!user) throw new Error('AUTH_REQUIRED');
  return user;
}

export function registerEmailAccountRoutes(app: FastifyInstance) {
  // ---- Dashboard: account management (user + internal auth) ----
  app.get('/api/email-accounts', async (req, reply) => {
    try {
      requireUser(req);
    } catch {
      return reply.code(401).send({ error: 'User session required' });
    }
    const accounts = await listAccounts();
    const providers = (['gmail', 'microsoft', 'resend'] as EmailProviderKind[]).map((k) => ({
      kind: k,
      ...providerConfigStatus(k),
    }));
    reply.send({ accounts, providers, safety: await getEmailSafety() });
  });

  app.post('/api/email-accounts/connect', async (req, reply) => {
    const user = requireUser(req);
    if (!can(user.role, 'email:manage')) return reply.code(403).send({ error: 'Not authorized to manage email accounts' });
    const { provider, purpose, label } = req.body as any;
    if (!['gmail', 'microsoft', 'resend'].includes(provider)) return reply.code(400).send({ error: 'Invalid provider' });
    try {
      const result = await startConnect(provider as EmailProviderKind, purpose || 'outreach', label);
      reply.send({ auth_url: result.authUrl, account_id: result.accountId });
    } catch (err: any) {
      if (err instanceof SafetyGateError) return reply.code(400).send({ error: err.message, code: err.code });
      reply.code(500).send({ error: err.message });
    }
  });

  app.post('/api/email-accounts/:id/test', async (req, reply) => {
    const user = requireUser(req);
    if (!can(user.role, 'email:manage')) return reply.code(403).send({ error: 'Not authorized' });
    try {
      const result = await testConnection(Number((req.params as any).id));
      reply.send(result);
    } catch (err: any) {
      reply.code(400).send({ ok: false, detail: err.message });
    }
  });

  app.post('/api/email-accounts/:id/disconnect', async (req, reply) => {
    const user = requireUser(req);
    if (!can(user.role, 'email:manage')) return reply.code(403).send({ error: 'Not authorized' });
    await disconnectAccount(Number((req.params as any).id));
    reply.send({ ok: true });
  });

  app.post('/api/email-accounts/:id/default', async (req, reply) => {
    const user = requireUser(req);
    if (!can(user.role, 'email:manage')) return reply.code(403).send({ error: 'Not authorized' });
    const { purpose } = req.body as any;
    await setDefaultAccount(Number((req.params as any).id), purpose === 'transactional' ? 'transactional' : 'outreach');
    reply.send({ ok: true });
  });

  // ---- OAuth callbacks (browser redirect target) ----
  app.get('/api/email-accounts/oauth/callback/:provider', async (req, reply) => {
    const provider = (req.params as any).provider as EmailProviderKind;
    const q: any = req.query; const { code, state, error } = q;
    if (error) {
      const referer = config.publicBaseUrl;
      return reply.redirect(`${referer}/email-accounts?oauth_error=${encodeURIComponent(String(error))}`);
    }
    const accountId = Number(q.account_id || 0);
    try {
      const redirectUri =
        provider === 'gmail' ? config.oauth.gmail.redirectUri : config.oauth.microsoft.redirectUri;
      const account = await completeConnect(provider, accountId, String(code), String(state || ''), String(q.redirect_uri || ''));
      reply.redirect(`${config.publicBaseUrl}/email-accounts?connected=${encodeURIComponent(account.email)}`);
    } catch (err: any) {
      reply.redirect(`${config.publicBaseUrl}/email-accounts?oauth_error=${encodeURIComponent(err.message)}`);
    }
  });

  // ---- Webhook: real send (called by n8n) ----
  app.post('/api/webhook/outreach/:id/send', async (req, reply) => {
    const outreachId = Number((req.params as any).id);
    const body: any = req.body || {};
    const messageId = Number(body.message_id || 0);
    if (!messageId) return reply.code(400).send({ error: 'message_id is required' });
    try {
      const result = await sendOutreachMessage(outreachId, messageId);
      reply.send({ ok: true, status: result.status, result: result.result });
    } catch (err: any) {
      if (err instanceof SafetyGateError) {
        return reply.code(err.code === 'outreach_paused' ? 423 : 429).send({ error: err.message, code: err.code });
      }
      reply.code(502).send({ error: err.message });
    }
  });

  // ---- Webhook: reply detection poll (called by n8n) ----
  app.get('/api/webhook/email-accounts-for-polling', async (_req, reply) => {
    const res = await pool.query(
      `SELECT id, provider, email, status FROM email_accounts
       WHERE provider IN ('gmail', 'microsoft') AND status = 'connected' ORDER BY id`
    );
    reply.send({ accounts: res.rows });
  });

  app.post('/api/webhook/email-accounts/:id/poll-replies', async (req, reply) => {
    const accountId = Number((req.params as any).id);
    try {
      const result = await pollAccountForReplies(accountId);
      reply.send({ ok: true, ...result });
    } catch (err: any) {
      reply.code(502).send({ error: err.message });
    }
  });

  // ---- Dashboard: outreach queue with send state ----
  app.get('/api/outreach-queue', async (req, reply) => {
    try {
      requireUser(req);
    } catch {
      return reply.code(401).send({ error: 'User session required' });
    }
    const res = await pool.query(
      `SELECT o.id, o.subject, o.target_company, o.status, o.approved_by, o.approved_at,
              m.id AS message_id, m.status AS message_status, m.provider, m.provider_message_id,
              m.error_code, m.error_message, m.attempts, m.sent_at, m.failed_at
       FROM outreach o LEFT JOIN LATERAL (
         SELECT * FROM outreach_messages WHERE outreach_id = o.id ORDER BY id DESC LIMIT 1
       ) m ON true
       ORDER BY o.id DESC LIMIT 100`
    );
    reply.send({ items: res.rows });
  });

  // ---- Dashboard: email activity ----
  app.get('/api/email-activity', async (req, reply) => {
    try {
      requireUser(req);
    } catch {
      return reply.code(401).send({ error: 'User session required' });
    }
    const res = await pool.query(
      `SELECT e.id, e.outreach_id, e.message_id, e.event, e.detail, e.created_at
       FROM outreach_events e ORDER BY e.id DESC LIMIT 200`
    );
    reply.send({ events: res.rows });
  });
}
