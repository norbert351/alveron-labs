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

  // ---------------------------------------------------------------
  // Phase 12 — Global research engine
  // ---------------------------------------------------------------
  /** AI reasoning layer. Groq is the primary provider (spec section 4). */
  ai: {
    provider: process.env.ALVERON_AI_PROVIDER || 'groq',
    groq: {
      apiKey: process.env.GROQ_API_KEY || '',
      baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      timeoutMs: Number(process.env.GROQ_TIMEOUT_MS || 60000),
      maxRetries: Number(process.env.GROQ_MAX_RETRIES || 3),
    },
  },
  /** Discovery provider abstraction — Overpass/OSM needs no credentials. */
  discovery: {
    provider: process.env.ALVERON_DISCOVERY_PROVIDER || 'overpass',
    overpassUrl: process.env.ALVERON_OVERPASS_URL || 'https://overpass-api.de/api/interpreter',
    nominatimUrl: process.env.ALVERON_NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
    contactEmail: process.env.ALVERON_CONTACT_EMAIL || 'research@alveron-labs.example',
    timeoutMs: Number(process.env.ALVERON_DISCOVERY_TIMEOUT_MS || 120000),
    maxResults: Number(process.env.ALVERON_DISCOVERY_MAX_RESULTS || 400),
  },
  /** Tiered crawler limits (spec sections 7, 8, 21, 28) */
  crawler: {
    maxPages: Number(process.env.ALVERON_CRAWL_MAX_PAGES || 12),
    maxBytes: Number(process.env.ALVERON_CRAWL_MAX_BYTES || 3_000_000),
    timeoutMs: Number(process.env.ALVERON_CRAWL_TIMEOUT_MS || 20000),
    maxDepth: Number(process.env.ALVERON_CRAWL_MAX_DEPTH || 2),
    concurrencyHttp: Number(process.env.ALVERON_CRAWL_CONCURRENCY_HTTP || 6),
    concurrencyBrowser: Number(process.env.ALVERON_CRAWL_CONCURRENCY_BROWSER || 1),
    respectRobots: process.env.ALVERON_CRAWL_RESPECT_ROBOTS !== 'false',
    screenshots: process.env.ALVERON_CRAWL_SCREENSHOTS === 'true',
    screenshotDir: process.env.ALVERON_SCREENSHOT_DIR || '/tmp/alveron-screenshots',
  },
  /** Re-research guard (spec section 24) */
  research: {
    reCrawlDays: Number(process.env.ALVERON_RESEARCH_RE_CRAWL_DAYS || 7),
    companyConcurrency: Number(process.env.ALVERON_RESEARCH_COMPANY_CONCURRENCY || 2),
    /** Hard per-company safety timeout so a single hung site can't stall a run. */
    companyTimeoutMs: Number(process.env.ALVERON_RESEARCH_COMPANY_TIMEOUT_MS || 180000),
  },
};

/** Delivery statuses accepted from providers / n8n */
export const DELIVERY_STATUSES = ['queued', 'sending', 'sent', 'delivered', 'failed', 'bounced'] as const;
