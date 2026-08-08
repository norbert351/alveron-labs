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

const AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';

const SCOPES = ['offline_access', 'User.Read', 'Mail.Send', 'Mail.Read'];

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Microsoft token endpoint failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  return data;
}

export class MicrosoftGraphProvider implements EmailProvider {
  readonly kind = 'microsoft' as const;

  private creds() {
    const { clientId, clientSecret, redirectUri } = config.oauth.microsoft;
    const missing: string[] = [];
    if (!clientId) missing.push('MICROSOFT_CLIENT_ID');
    if (!clientSecret) missing.push('MICROSOFT_CLIENT_SECRET');
    if (!redirectUri) missing.push('MICROSOFT_REDIRECT_URI');
    if (missing.length) {
      throw new ConfigError(
        `Microsoft 365 provider is not configured. Set ${missing.join(', ')} in the API environment.`,
        missing
      );
    }
    return { clientId, clientSecret, redirectUri };
  }

  isConfigured(): boolean {
    return Boolean(config.oauth.microsoft.clientId && config.oauth.microsoft.clientSecret);
  }

  missingConfig(): string[] {
    const missing: string[] = [];
    if (!config.oauth.microsoft.clientId) missing.push('MICROSOFT_CLIENT_ID');
    if (!config.oauth.microsoft.clientSecret) missing.push('MICROSOFT_CLIENT_SECRET');
    return missing;
  }

  buildAuthUrl(state: string): string {
    const { clientId, redirectUri } = this.creds();
    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPES.join(' '),
      response_mode: 'query',
      state,
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
      scope: SCOPES.join(' '),
    });
    if (!data.access_token) throw new Error(`OAuth code exchange failed: ${JSON.stringify(data).slice(0, 200)}`);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
      scope: data.scope,
    };
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }> {
    const { clientId, clientSecret } = this.creds();
    const data = await postForm(TOKEN_URL, {
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      scope: SCOPES.join(' '),
    });
    if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data).slice(0, 200)}`);
    return { accessToken: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  }

  private async authedFetch(account: EmailAccountRow, path: string, init?: RequestInit) {
    const { resolveAccessToken } = await import('./GmailProvider.ts');
    const token = await resolveAccessToken(account, this as any);
    const res = await fetch(`${GRAPH}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Graph API ${path} failed (${res.status}): ${body.slice(0, 300)}`);
    }
    return res.json();
  }

  async send(account: EmailAccountRow, message: SendMessage): Promise<SendResult> {
    const headers: { name: string; value: string }[] = [];
    if (message.inReplyTo) headers.push({ name: 'In-Reply-To', value: message.inReplyTo });
    if (message.references) headers.push({ name: 'References', value: message.references });
    const payload = {
      message: {
        subject: message.subject,
        body: { contentType: 'html' as const, content: message.html },
        toRecipients: [{ emailAddress: { address: message.to } }],
        ...(headers.length ? { internetMessageHeaders: headers } : {}),
        ...(message.threadId ? { conversationId: message.threadId } : {}),
      },
      saveToSentItems: true,
    };
    await this.authedFetch(account, '/me/sendMail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    // Microsoft Graph sendMail does not return a message id or thread id.
    // The sent item is saved; reply detection uses the recipient's address.
    return { providerMessageId: null, threadId: message.threadId ?? null };
  }

  async pollReplies(account: EmailAccountRow, since: Date): Promise<ReplyEvent[]> {
    const sinceIso = since.toISOString();
    const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
    const res: any = await this.authedFetch(
      account,
      `/me/messages?$filter=${filter}&$select=id,from,subject,receivedDateTime,conversationId,bodyPreview,internetMessageHeaders&$top=50`
    );
    const events: ReplyEvent[] = [];
    for (const m of res.value || []) {
      const from = m.from?.emailAddress;
      const fromAddr = (from?.address || '').toLowerCase();
      if (!fromAddr || fromAddr === account.email.toLowerCase()) continue;
      const headers: Record<string, string> = {};
      for (const h of m.internetMessageHeaders || []) headers[h.name.toLowerCase()] = h.value;
      const subject = m.subject || '(no subject)';
      const auto = headers['auto-submitted'] || '';
      const suppress = headers['x-auto-response-suppress'] || '';
      const precedence = headers['precedence'] || '';
      const isBounce =
        /(mailer-daemon|postmaster|mail delivery subsystem)/i.test(fromAddr) ||
        /delivery (status )?notification|failure notice|undeliverable/i.test(subject);
      const isAuto = /auto-replied|auto-reply/i.test(auto) || /out-of-office|autoreply/i.test(suppress) || /auto_reply|bulk/i.test(precedence);
      events.push({
        messageId: m.id,
        threadId: m.conversationId ?? null,
        from: fromAddr,
        fromName: from?.name || null,
        subject,
        receivedAt: m.receivedDateTime,
        kind: isBounce ? 'bounce' : isAuto ? (precedence === 'bulk' ? 'auto_response' : 'out_of_office') : 'reply',
        excerpt: (m.bodyPreview || '').slice(0, 300),
      });
    }
    return events;
  }

  async disconnect(): Promise<void> {
    // Microsoft revoke endpoint is tenant-scoped; clearing local state is the revocation.
    return;
  }
}
