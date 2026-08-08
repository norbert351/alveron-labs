import { config } from '../config.ts';
import {
  ConfigError,
  type EmailAccountRow,
  type EmailProvider,
  type ReplyEvent,
  type SendMessage,
  type SendResult,
} from './types.ts';

const API = 'https://api.resend.com';

/**
 * Resend provider: transactional/system email via API key.
 * No OAuth. Reply detection is not natively supported by Resend;
 * use Gmail/Graph for reply detection on outreach accounts.
 */
export class ResendProvider implements EmailProvider {
  readonly kind = 'resend' as const;

  private key(): string {
    if (!config.oauth.resend.apiKey) {
      throw new ConfigError('Resend provider is not configured. Set RESEND_API_KEY.', ['RESEND_API_KEY']);
    }
    return config.oauth.resend.apiKey;
  }

  isConfigured(): boolean {
    return Boolean(config.oauth.resend.apiKey);
  }

  missingConfig(): string[] {
    return config.oauth.resend.apiKey ? [] : ['RESEND_API_KEY'];
  }

  buildAuthUrl(): string {
    throw new ConfigError('Resend uses an API key, not OAuth. Set RESEND_API_KEY instead.', ['RESEND_API_KEY']);
  }

  async exchangeCode(): Promise<any> {
    throw new ConfigError('Resend uses an API key, not OAuth.', []);
  }

  async refreshTokens(): Promise<{ accessToken: string; expiresAt: number }> {
    throw new ConfigError('Resend API keys do not expire or refresh.', []);
  }

  async send(account: EmailAccountRow, message: SendMessage): Promise<SendResult> {
    const headers: Record<string, string> = {};
    if (message.inReplyTo) headers['In-Reply-To'] = message.inReplyTo;
    if (message.references) headers['References'] = message.references;
    const res = await fetch(`${API}/emails`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.key()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${account.label || 'Alveron Labs'} <${account.email}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(Object.keys(headers).length ? { headers } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`Resend send failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
    }
    return { providerMessageId: data.id ?? null, threadId: message.threadId ?? null };
  }

  async pollReplies(): Promise<ReplyEvent[]> {
    // Resend has no mailbox read API; reply detection is unsupported here.
    return [];
  }

  async disconnect(): Promise<void> {
    return;
  }
}
