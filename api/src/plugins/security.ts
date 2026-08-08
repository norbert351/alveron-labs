import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config.ts';
import { logActivity } from '../db.ts';
import { userForToken } from '../auth.ts';

/**
 * Security layer:
 * - rate limiting on everything
 * - /api/webhook/* requires X-Webhook-Key (n8n, email providers)
 * - everything else under /api requires Authorization: Bearer <internal token>
 * - optional X-User-Token user session on dashboard routes (req.user)
 * - /api/health and OAuth callbacks stay public
 * - auth failures are audit-logged (throttled per IP)
 */

export async function registerSecurity(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindowMs,
    ban: 3,
    errorResponseBuilder: (_req, context) => ({
      error: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  const authFailures = new Map<string, number>();
  const throttleAudit = (ip: string, map: Map<string, number>) => {
    const now = Date.now();
    if (now - (map.get(ip) || 0) > 60000) {
      map.set(ip, now);
      return true;
    }
    return false;
  };

  // user session resolution (dashboard routes)
  app.addHook('onRequest', async (req) => {
    const userToken = req.headers['x-user-token'] as string | undefined;
    if (userToken) {
      const user = await userForToken(userToken).catch(() => null);
      if (user) (req as any).user = user;
    }
  });

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path === '/api/health') return;
    if (path.startsWith('/api/email-accounts/oauth/callback/')) return;
    if (!path.startsWith('/api/')) return;

    const ip = req.ip || 'unknown';
    if (path.startsWith('/api/webhook/')) {
      const key = req.headers['x-webhook-key'];
      if (key === config.auth.webhookToken) return;
      if (throttleAudit(ip, authFailures)) {
        await logActivity({ actor: ip, action: 'auth_failed_webhook', entityType: 'webhook', detail: { path } });
      }
      return reply.code(401).send({ error: 'Invalid webhook key' });
    }

    const auth = req.headers.authorization || '';
    if (auth === `Bearer ${config.auth.internalToken}`) return;
    if (throttleAudit(ip, authFailures)) {
      await logActivity({ actor: ip, action: 'auth_failed', entityType: 'api', detail: { path } });
    }
    return reply.code(401).send({ error: 'Unauthorized' });
  });
}
