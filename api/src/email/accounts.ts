import { randomBytes } from 'node:crypto';
import { log } from '../log.ts';
import { pool, getSetting, logActivity } from '../db.ts';
import { config } from '../config.ts';
import { encryptionReady, encryptSecret, decryptSecret, safeEqual } from '../security/crypto.ts';
import { getProvider, providerConfigStatus } from './index.ts';
import type { EmailAccountRow, EmailProviderKind, SendMessage, SendResult } from './types.ts';

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export class SafetyGateError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function getEmailSafety() {
  const s = (await getSetting('email_safety')) || {};
  return {
    pause_all: Boolean(s.pause_all),
    daily_limit: Number(s.daily_limit ?? 20),
    min_delay_minutes: Number(s.min_delay_minutes ?? 5),
    max_follow_ups: Number(s.max_follow_ups ?? 2),
  };
}

export async function listAccounts(): Promise<any[]> {
  const res = await pool.query(
    `SELECT id, provider, email, label, purpose, is_default, status, scopes,
            last_token_refresh_at, last_send_at, daily_send_count, daily_send_date, last_error,
            created_at, updated_at
     FROM email_accounts ORDER BY id`
  );
  return res.rows.map((r) => ({
    ...r,
    token_configured: true, // tokens exist but are never serialized out
  }));
}

export async function getAccount(id: number): Promise<EmailAccountRow | null> {
  const res = await pool.query(`SELECT * FROM email_accounts WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

export async function defaultAccountFor(purpose: 'outreach' | 'transactional'): Promise<EmailAccountRow | null> {
  const res = await pool.query(
    `SELECT * FROM email_accounts WHERE purpose = $1 AND is_default = true AND status = 'connected' ORDER BY id LIMIT 1`,
    [purpose]
  );
  if ((res.rowCount ?? 0) > 0) return res.rows[0];
  const alt = await pool.query(
    `SELECT * FROM email_accounts WHERE purpose = $1 AND status = 'connected' ORDER BY id LIMIT 1`,
    [purpose]
  );
  return alt.rows[0] || null;
}

/** Start an OAuth connection: validates config + encryption, returns the consent URL. */
export async function startConnect(kind: EmailProviderKind, purpose: 'outreach' | 'transactional', label?: string): Promise<{ accountId: number; authUrl: string }> {
  const provider = getProvider(kind);
  const status = providerConfigStatus(kind);
  if (!status.configured) {
    throw new SafetyGateError('provider_not_configured', `Provider ${kind} is not configured. Missing: ${status.missing.join(', ')}`);
  }
  if (!encryptionReady()) {
    throw new SafetyGateError(
      'encryption_not_configured',
      'ENCRYPTION_KEY is not set. OAuth tokens are stored encrypted at rest and will not be persisted without it.'
    );
  }
  const state = randomBytes(24).toString('base64url');
  const res = await pool.query(
    `INSERT INTO email_accounts (provider, email, label, purpose, status, oauth_state, oauth_state_expires_at)
     VALUES ($1, 'pending@' || $1, $2, $3, 'pending', $4, now() + interval '10 minutes')
     RETURNING id`,
    [kind, label || `${kind} mailbox`, purpose, state]
  );
  const authUrl = provider.buildAuthUrl(state);
  return { accountId: res.rows[0].id, authUrl };
}

/** OAuth callback: validates state + redirect, exchanges the code, stores tokens encrypted. */
export async function completeConnect(
  kind: EmailProviderKind,
  accountId: number,
  code: string,
  state: string,
  redirectUri: string
): Promise<EmailAccountRow> {
  const provider = getProvider(kind);
  const account = await getAccount(accountId);
  if (!account) throw new Error('OAuth session not found');
  if (!account.oauth_state || !account.oauth_state_expires_at) throw new Error('OAuth session expired or already used');
  if (new Date(account.oauth_state_expires_at).getTime() < Date.now()) throw new Error('OAuth state expired, start the connection again');
  if (!safeEqual(account.oauth_state, state)) throw new Error('OAuth state mismatch, start the connection again');

  // redirect_uri validation: must exactly match the configured value
  const expected = kind === 'gmail' ? config.oauth.gmail.redirectUri : config.oauth.microsoft.redirectUri;
  if (redirectUri && redirectUri !== expected) {
    throw new Error('OAuth redirect_uri mismatch');
  }

  const tokens = await provider.exchangeCode(code);
  if (!tokens.refreshToken) {
    throw new Error('OAuth flow did not return a refresh token. Reconnect with prompt=consent.');
  }
  const email = tokens.email || `${accountId}@${kind}.local`;

  const res = await pool.query(
    `UPDATE email_accounts
     SET email = $2, status = 'connected', scopes = $3,
         access_token_encrypted = $4, refresh_token_encrypted = $5,
         token_expires_at = to_timestamp($6 / 1000.0), last_token_refresh_at = now(),
         oauth_state = NULL, oauth_state_expires_at = NULL, last_error = NULL, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [
      accountId,
      email,
      (tokens.scope || '').split(' ').filter(Boolean),
      encryptSecret(tokens.accessToken),
      encryptSecret(tokens.refreshToken),
      tokens.expiresAt,
    ]
  );
  await logActivity({ actor: 'system', action: 'email_account_connected', entityType: 'email_account', entityId: accountId, detail: { provider: kind, email } });
  return res.rows[0];
}

/** Refresh the account's access token if it is expired or nearly expired. */
export async function ensureFreshToken(account: EmailAccountRow): Promise<EmailAccountRow> {
  const provider = getProvider(account.provider);
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60000) return account;
  if (!account.refresh_token_encrypted) {
    await pool.query(
      `UPDATE email_accounts SET status = 'disconnected', last_error = 'refresh token missing', updated_at = now() WHERE id = $1`,
      [account.id]
    );
    throw new Error('Account token expired and no refresh token is stored. Reconnect the account.');
  }
  try {
    const refreshToken = decryptSecret(account.refresh_token_encrypted);
    const { accessToken, expiresAt: next } = await provider.refreshTokens(refreshToken);
    const updated = await pool.query(
      `UPDATE email_accounts
       SET access_token_encrypted = $2, token_expires_at = to_timestamp($3 / 1000.0),
           last_token_refresh_at = now(), status = 'connected', last_error = NULL, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [account.id, encryptSecret(accessToken), next]
    );
    await logActivity({ actor: 'system', action: 'token_refreshed', entityType: 'email_account', entityId: account.id });
    return updated.rows[0];
  } catch (err: any) {
    await pool.query(
      `UPDATE email_accounts SET status = 'disconnected', last_error = $2, updated_at = now() WHERE id = $1`,
      [account.id, String(err?.message || err).slice(0, 400)]
    );
    throw new Error(`Token refresh failed: ${err?.message || err}`);
  }
}

export async function testConnection(accountId: number): Promise<{ ok: boolean; detail: string }> {
  const account = await getAccount(accountId);
  if (!account) throw new Error('Account not found');
  const provider = getProvider(account.provider);
  if (account.provider === 'resend') {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${config.oauth.resend.apiKey}` },
    });
    return res.ok
      ? { ok: true, detail: 'Resend API key valid' }
      : { ok: false, detail: `Resend API key rejected (${res.status})` };
  }
  const fresh = await ensureFreshToken(account);
  const token = decryptSecret(fresh.access_token_encrypted!);
  const probe =
    account.provider === 'gmail'
      ? 'https://gmail.googleapis.com/gmail/v1/users/me/profile'
      : 'https://graph.microsoft.com/v1.0/me';
  const res = await fetch(probe, { headers: { Authorization: `Bearer ${token}` } });
  if (res.ok) {
    await pool.query(`UPDATE email_accounts SET status = 'connected', last_error = NULL, updated_at = now() WHERE id = $1`, [accountId]);
    return { ok: true, detail: 'Connection OK' };
  }
  const body = await res.text().catch(() => '');
  await pool.query(`UPDATE email_accounts SET status = 'error', last_error = $2, updated_at = now() WHERE id = $1`, [
    accountId,
    body.slice(0, 300),
  ]);
  return { ok: false, detail: `Provider rejected credentials (${res.status})` };
}

export async function disconnectAccount(accountId: number): Promise<void> {
  const account = await getAccount(accountId);
  if (!account) throw new Error('Account not found');
  const provider = getProvider(account.provider);
  await provider.disconnect(account).catch(() => {});
  await pool.query(
    `UPDATE email_accounts
     SET status = 'disconnected', access_token_encrypted = NULL, refresh_token_encrypted = NULL,
         token_expires_at = NULL, oauth_state = NULL, oauth_state_expires_at = NULL, last_error = NULL, updated_at = now()
     WHERE id = $1`,
    [accountId]
  );
  await logActivity({ actor: 'system', action: 'email_account_disconnected', entityType: 'email_account', entityId: accountId });
}

export async function setDefaultAccount(accountId: number, purpose: 'outreach' | 'transactional'): Promise<void> {
  await pool.query(`UPDATE email_accounts SET is_default = false WHERE purpose = $1`, [purpose]);
  await pool.query(`UPDATE email_accounts SET is_default = true, updated_at = now() WHERE id = $1`, [accountId]);
}

export async function recordDailySend(accountId: number): Promise<void> {
  await pool.query(
    `UPDATE email_accounts
     SET daily_send_count = CASE WHEN daily_send_date = CURRENT_DATE THEN daily_send_count + 1 ELSE 1 END,
         daily_send_date = CURRENT_DATE, last_send_at = now(), updated_at = now()
     WHERE id = $1`,
    [accountId]
  );
}

/** Send one outreach message through the default connected mailbox. Real provider call. */
export async function sendOutreachMessage(outreachId: number, messageId: number): Promise<{ status: string; result?: SendResult }> {
  const safety = await getEmailSafety();
  if (safety.pause_all) {
    throw new SafetyGateError('outreach_paused', 'Outreach is paused globally. No new sends are allowed.');
  }

  const msgRes = await pool.query(
    `SELECT m.*, o.subject AS o_subject, o.body AS o_body, o.target_company, o.company_id, o.email_version
     FROM outreach_messages m JOIN outreach o ON o.id = m.outreach_id
     WHERE m.id = $1 AND m.outreach_id = $2`,
    [messageId, outreachId]
  );
  if (msgRes.rowCount === 0) throw new Error('Message not found');
  const msg = msgRes.rows[0];

  const account = await defaultAccountFor('outreach');
  if (!account) {
    throw new SafetyGateError(
      'no_sending_account',
      'No connected default outreach mailbox. Connect Gmail in Settings → Email Accounts and mark it as the default.'
    );
  }
  if (account.status !== 'connected') {
    throw new SafetyGateError('account_not_connected', `Sending account ${account.email} is not connected (status: ${account.status}).`);
  }

  // daily limit (per sending account)
  const todayCount =
    account.daily_send_date === new Date().toISOString().slice(0, 10) ? account.daily_send_count : 0;
  if (todayCount >= safety.daily_limit) {
    throw new SafetyGateError('daily_limit_reached', `Daily send limit reached for ${account.email} (${todayCount}/${safety.daily_limit}).`);
  }

  // minimum delay between sends
  const lastSend = await pool.query(`SELECT MAX(sent_at) AS t FROM outreach_messages WHERE status IN ('sent', 'delivered')`);
  if (lastSend.rows[0].t) {
    const gapMs = Date.now() - new Date(lastSend.rows[0].t).getTime();
    if (gapMs < safety.min_delay_minutes * 60000) {
      throw new SafetyGateError('min_delay', `Minimum delay of ${safety.min_delay_minutes} minutes between sends not reached (${Math.round(gapMs / 60000)}m since last send).`);
    }
  }

  // threading: reuse the thread/message context from the first message of this outreach
  const first = await pool.query(
    `SELECT provider_thread_id, provider_message_id FROM outreach_messages
     WHERE outreach_id = $1 AND status = 'sent' ORDER BY id LIMIT 1`,
    [outreachId]
  );
  const threadId = first.rows[0]?.provider_thread_id || null;
  const inReplyTo = first.rows[0]?.provider_message_id || null;

  const provider = getProvider(account.provider);
  const sendMessage: SendMessage = {
    to: msg.target_company, // placeholder recipient until a real contact email is captured
    subject: msg.o_subject,
    html: msg.o_body,
    threadId: threadId ?? undefined,
    inReplyTo: inReplyTo ?? undefined,
    references: inReplyTo ?? undefined,
  };

  const fresh = await ensureFreshToken(account);
  await pool.query(
    `UPDATE outreach_messages SET status = 'sending', attempts = attempts + 1, email_account_id = $2, sender_email = $3, recipient = $4, subject = $5, updated_at = now() WHERE id = $1`,
    [messageId, fresh.id, fresh.email, sendMessage.to, sendMessage.subject]
  );

  try {
    const result = await provider.send(fresh, sendMessage);
    await pool.query(
      `UPDATE outreach_messages
       SET status = 'sent', provider = $2, provider_message_id = $3, provider_thread_id = $4,
           sent_at = now(), error_code = NULL, error_message = NULL, updated_at = now()
       WHERE id = $1`,
      [messageId, account.provider, result.providerMessageId, result.threadId]
    );
    await pool.query(`UPDATE outreach SET status = 'sent', sent_at = now(), updated_at = now() WHERE id = $1`, [outreachId]);
    await pool.query(
      `UPDATE companies SET status = 'outreach', stage = 'Contacted', updated_at = now() WHERE id = $1`,
      [msg.company_id]
    );
    await pool.query(`INSERT INTO outreach_events (outreach_id, message_id, event, detail) VALUES ($1, $2, 'sent', $3)`, [
      outreachId,
      messageId,
      JSON.stringify({ provider: account.provider, provider_message_id: result.providerMessageId, thread_id: result.threadId }),
    ]);
    await logActivity({ actor: 'system', action: 'email_sent', entityType: 'outreach', entityId: outreachId, detail: { provider: account.provider, message_id: messageId } });
    await recordDailySend(fresh.id);
    log({ op: 'email_sent', outreach_id: outreachId, message_id: messageId, account_id: fresh.id, status: 'sent', detail: { provider: account.provider, provider_message_id: result.providerMessageId } });
    return { status: 'sent', result };
  } catch (err: any) {
    const msgErr = String(err?.message || err);
    const permanent = /401|403|invalid_grant|not configured|no_sending|account_not_connected|daily_limit|min_delay/i.test(msgErr);
    await pool.query(
      `UPDATE outreach_messages
       SET status = 'failed', error_code = $2, error_message = $3, failed_at = now(), updated_at = now()
       WHERE id = $1`,
      [messageId, permanent ? 'permanent' : 'temporary', msgErr.slice(0, 500)]
    );
    await pool.query(`INSERT INTO outreach_events (outreach_id, message_id, event, detail) VALUES ($1, $2, 'failed', $3)`, [
      outreachId,
      messageId,
      JSON.stringify({ error: msgErr.slice(0, 500), permanent }),
    ]);
    log({ op: 'email_send_failed', outreach_id: outreachId, message_id: messageId, account_id: fresh.id, status: 'failed', detail: { error: msgErr.slice(0, 300), permanent } });
    throw err;
  }
}
