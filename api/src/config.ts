import 'dotenv/config';

export const config = {
  port: Number(process.env.ALVERON_PORT || process.env.PORT || 3100),
  databaseUrl:
    process.env.ALVERON_DATABASE_URL ||
    'postgres://alveron:alveron_dev_pw@127.0.0.1:5433/alveron',
  llm: {
    baseUrl: process.env.ALVERON_LLM_BASE_URL || '',
    apiKey: process.env.ALVERON_LLM_API_KEY || '',
    model: process.env.ALVERON_LLM_MODEL || 'gpt-5.6-terra',
    timeoutMs: Number(process.env.ALVERON_LLM_TIMEOUT_MS || 180000),
  },
  auth: {
    internalToken: process.env.ALVERON_INTERNAL_TOKEN || 'dev-internal-token-change-me',
    webhookToken: process.env.ALVERON_WEBHOOK_TOKEN || 'dev-webhook-token-change-me',
    sessionTtlHours: Number(process.env.ALVERON_SESSION_TTL_HOURS || 168),
  },
  rateLimit: {
    max: Number(process.env.ALVERON_RATE_LIMIT_MAX || 120),
    timeWindowMs: Number(process.env.ALVERON_RATE_LIMIT_WINDOW_MS || 60000),
  },
  /** 32 random bytes, base64. Required to persist OAuth tokens. */
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  oauth: {
    gmail: {
      clientId: process.env.GMAIL_CLIENT_ID || '',
      clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
      redirectUri:
        process.env.GMAIL_REDIRECT_URI || 'http://127.0.0.1:3100/api/email-accounts/oauth/callback/gmail',
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      redirectUri:
        process.env.MICROSOFT_REDIRECT_URI || 'http://127.0.0.1:3100/api/email-accounts/oauth/callback/microsoft',
    },
    resend: {
      apiKey: process.env.RESEND_API_KEY || '',
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET || '',
    },
  },
  publicBaseUrl: process.env.ALVERON_PUBLIC_BASE_URL || 'http://127.0.0.1:3100',
  fetcher: {
    userAgent:
      process.env.ALVERON_FETCH_UA ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    timeoutMs: Number(process.env.ALVERON_FETCH_TIMEOUT_MS || 20000),
    maxPages: Number(process.env.ALVERON_FETCH_MAX_PAGES || 4),
    maxCharsPerPage: Number(process.env.ALVERON_FETCH_MAX_CHARS || 60000),
    maxContentChars: Number(process.env.ALVERON_FETCH_MAX_CONTENT_CHARS || 120000),
    browserFallback: process.env.ALVERON_BROWSER_FALLBACK !== 'false',
  },
};

/** Delivery statuses accepted from providers / n8n */
export const DELIVERY_STATUSES = ['queued', 'sending', 'sent', 'delivered', 'failed', 'bounced'] as const;
