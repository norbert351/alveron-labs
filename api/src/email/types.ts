export type EmailProviderKind = 'gmail' | 'microsoft' | 'resend';

export interface EmailAccountRow {
  id: number;
  provider: EmailProviderKind;
  email: string;
  label: string | null;
  purpose: 'outreach' | 'transactional';
  is_default: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'pending';
  scopes: string[];
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: string | null;
  last_token_refresh_at: string | null;
  last_send_at: string | null;
  daily_send_count: number;
  daily_send_date: string | null;
  last_error: string | null;
  oauth_state: string | null;
  oauth_state_expires_at: string | null;
  history_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendMessage {
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string;
  references?: string;
  threadId?: string;
}

export interface SendResult {
  providerMessageId: string | null;
  threadId: string | null;
}

export interface ReplyEvent {
  messageId: string;
  threadId: string | null;
  from: string;
  fromName: string | null;
  subject: string;
  receivedAt: string;
  kind: 'reply' | 'bounce' | 'out_of_office' | 'auto_response';
  excerpt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
  scope?: string;
  email?: string;
}

export class ConfigError extends Error {
  missingVars: string[];
  constructor(message: string, missingVars: string[]) {
    super(message);
    this.name = 'ConfigError';
    this.missingVars = missingVars;
  }
}

export interface EmailProvider {
  readonly kind: EmailProviderKind;
  /** True when the provider can start an OAuth flow (or has an API key). */
  isConfigured(): boolean;
  /** Human-readable list of missing env vars. */
  missingConfig(): string[];
  buildAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<TokenPair>;
  refreshTokens(refreshToken: string): Promise<{ accessToken: string; expiresAt: number }>;
  send(account: EmailAccountRow, message: SendMessage): Promise<SendResult>;
  /** Poll provider for new replies/bounces since a checkpoint. Returns events. */
  pollReplies(account: EmailAccountRow, since: Date): Promise<ReplyEvent[]>;
  /** Mark the account disconnected at the provider (revoke if supported). */
  disconnect(account: EmailAccountRow): Promise<void>;
}
