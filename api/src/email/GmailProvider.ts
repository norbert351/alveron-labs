import { config } from '../config.ts';
import {
  ConfigError,
  type EmailAccountRow,
  type EmailProvider,
  type ReplyEvent,
  type SendMessage,
  type SendResult,
  type TokenPair,
} from './types.ts';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

const SCOPES = ['openid', 'email', 'gmail.send', 'gmail.modify'];

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Google token endpoint failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

export class GmailProvider implements EmailProvider {
  readonly kind = 'gmail' as const;

  private creds() {
    const { clientId, clientSecret, redirectUri } = config.oauth.gmail;
    const missing: string[] = [];
    if (!clientId) missing.push('GMAIL_CLIENT_ID');
    if (!clientSecret) missing.push('GMAIL_CLIENT_SECRET');
    if (!redirectUri) missing.push('GMAIL_REDIRECT_URI');
    if (missing.length) {
      throw new ConfigError(
        `Gmail provider is not configured. Set ${missing.join(', ')} in the API environment.`,
        missing
      );
    }
    return { clientId, clientSecret, redirectUri };
  }

  isConfigured(): boolean {
    return Boolean(config.oauth.gmail.clientId && config.oauth.gmail.clientSecret);
  }

  missingConfig(): string[] {
    const missing: string[] = [];
    if (!config.oauth.gmail.clientId) missing.push('GMAIL_CLIENT_ID');
    if (!config.oauth.gmail.clientSecret) missing.push('GMAIL_CLIENT_SECRET');
    return missing;
  }

  buildAuthUrl(state: string): string {
    const { clientId, redirectUri } = this.creds();
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
      include_granted_scopes: 'false',
    });
    return `${AUTH_URL}?${q.toString()}`;
  }

  async exchangeCode(code: string): Promise<TokenPair> {
    const { clientId, clientSecret, redirectUri } = this.creds();
    const data = await postForm(TOKEN_URL, {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    if (!data.access_token) throw new Error(`OAuth code exchange failed: ${JSON.stringify(data).slice(0, 200)}`);
    // resolve the authorized email
    let email: string | undefined;
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (res.ok) {
        const info: any = await res.json();
        email = info.email;
      }
    } catch {
      /* email resolution is best-effort; falls back to unknown@provider */
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
      scope: data.scope,
      email,
    };
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
    const { clientId, clientSecret } = this.creds();
    const data = await postForm(TOKEN_URL, {
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    });
    if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data).slice(0, 200)}`);
    return { accessToken: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  }

  private async authedFetch(account: EmailAccountRow, path: string, init?: RequestInit) {
    const token = await resolveAccessToken(account, this);
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Gmail API ${path} failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  async send(account: EmailAccountRow, message: SendMessage): Promise<SendResult> {
    const headers = [
      `From: ${account.email}`,
      `To: ${message.to}`,
      `Subject: ${message.subject.replace(/\r?\n/g, ' ')}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: quoted-printable',
    ];
    if (message.inReplyTo) headers.push(`In-Reply-To: ${message.inReplyTo}`);
    if (message.references) headers.push(`References: ${message.references}`);
    const body = message.html.replace(/\r?\n/g, '\r\n');
    const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + body, 'utf8').toString('base64url');
    const payload: Record<string, unknown> = { raw };
    if (message.threadId) payload.threadId = message.threadId;
    const data = await this.authedFetch(account, '/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { providerMessageId: data.id ?? null, threadId: data.threadId ?? null };
  }

  async pollReplies(account: EmailAccountRow, since: Date): Promise<ReplyEvent[]> {
    const sinceSec = Math.floor(since.getTime() / 1000);
    const q = encodeURIComponent(`in:inbox newer_than:3d`);
    const list: any = await this.authedFetch(account, `/messages?q=${q}&maxResults=50`);
    const events: ReplyEvent[] = [];
    for (const m of list.messages || []) {
      const full: any = await this.authedFetch(account, `/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Auto-Submitted&metadataHeaders=X-Auto-Response-Suppress&metadataHeaders=Precedence`);
      const headers: Record<string, string> = {};
      for (const h of full.payload?.headers || []) headers[h.name.toLowerCase()] = h.value;
      const internalDate = Number(full.internalDate || 0);
      if (internalDate < sinceSec * 1000) continue;
      const from = headers['from'] || '';
      const fromAddr = (from.match(/<([^>]+)>/) || [null, from])[1]?.toLowerCase() || '';
      if (fromAddr === account.email.toLowerCase()) continue; // our own sends
      const subject = headers['subject'] || '(no subject)';
      const auto = headers['auto-submitted'] || '';
      const suppress = headers['x-auto-response-suppress'] || '';
      const precedence = headers['precedence'] || '';
      const isBounce =
        /(mailer-daemon|postmaster|mail delivery subsystem)/i.test(from) ||
        /delivery (status )?notification|failure notice|undeliverable/i.test(subject);
      const isAuto = /auto-replied|auto-reply/i.test(auto) || /out-of-office|autoreply|auto-reply/i.test(suppress) || /auto_reply|bulk/i.test(precedence);
      const snippet = (full.snippet || '').slice(0, 300);
      events.push({
        messageId: m.id,
        threadId: full.threadId ?? null,
        from: fromAddr,
        fromName: (from.match(/^([^<]+)</) || [null, null])[1]?.trim() || null,
        subject,
        receivedAt: new Date(internalDate).toISOString(),
        kind: isBounce ? 'bounce' : isAuto ? (precedence === 'bulk' ? 'auto_response' : 'out_of_office') : 'reply',
        excerpt: snippet,
      });
    }
    return events;
  }

  async disconnect(account: EmailAccountRow): Promise<void> {
    // Gmail has no simple revoke endpoint; token deletion on our side is the revocation.
    const { clientId, clientSecret } = config.oauth.gmail;
    if (!account.refresh_token_encrypted || !clientId || !clientSecret) return;
    // best-effort revoke of the refresh token
    try {
      const { decryptSecret } = await import('../security/crypto.ts');
      const rt = decryptSecret(account.refresh_token_encrypted);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rt)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    } catch {
      /* revocation failure is acceptable; local state is cleared */
    }
  }
}

/** Shared helper: decrypt refresh token, refresh if expired, return access token. */
async function resolveAccessToken(account: EmailAccountRow, provider: GmailProvider): Promise<string> {
  if (!account.access_token_encrypted) throw new Error('Account has no stored access token');
  const { decryptSecret } = await import('../security/crypto.ts');
  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (Date.now() < expiresAt - 60000) {
    return decryptSecret(account.access_token_encrypted);
  }
  if (!account.refresh_token_encrypted) {
    throw new Error('Access token expired and no refresh token is stored. Reconnect the account.');
  }
  const refreshToken = decryptSecret(account.refresh_token_encrypted);
  const { accessToken, expiresAt: nextExpiry } = await provider.refreshTokens(refreshToken);
  // caller persists via refreshAccountTokens()
  return accessToken;
}

export { resolveAccessToken };
