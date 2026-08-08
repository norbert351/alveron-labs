import 'dotenv/config';

export const config = {
  port: Number(process.env.ALVERON_PORT || process.env.PORT || 3100),
  databaseUrl:
    process.env.ALVERON_DATABASE_URL ||
    'postgres://alveron:alveron_dev_pw@127.0.0.1:5433/alveron',
  llm: {
    baseUrl: process.env.ALVERON_LLM_BASE_URL || 'https://api.freemodel.dev/v1',
    apiKey: process.env.ALVERON_LLM_API_KEY || '',
    model: process.env.ALVERON_LLM_MODEL || 'gpt-5.6-terra',
    timeoutMs: Number(process.env.ALVERON_LLM_TIMEOUT_MS || 180000),
  },
  auth: {
    // Bearer token required on all /api/* routes (used by the Next.js proxy)
    internalToken: process.env.ALVERON_INTERNAL_TOKEN || 'dev-internal-token-change-me',
    // X-Webhook-Key required on /api/webhook/* (used by n8n and email providers)
    webhookToken: process.env.ALVERON_WEBHOOK_TOKEN || 'dev-webhook-token-change-me',
  },
  rateLimit: {
    max: Number(process.env.ALVERON_RATE_LIMIT_MAX || 120),
    timeWindowMs: Number(process.env.ALVERON_RATE_LIMIT_WINDOW_MS || 60000),
  },
  fetcher: {
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 AlveronLabs/0.1',
    timeoutMs: 20000,
    maxContentChars: 60000,
    maxPages: 4,
  },
};

export const ALVERON_SERVICES = [
  'AI Automation',
  'AI Agents',
  'Custom Software',
  'SaaS Development',
  'Web Applications',
  'Web3 Solutions',
] as const;

export type AlveronService = (typeof ALVERON_SERVICES)[number];

export const PIPELINE_STAGES = [
  'Discovered',
  'Researching',
  'Qualified',
  'Proposal Ready',
  'Approved',
  'Contacted',
  'Replied',
  'Meeting',
  'Won',
  'Lost',
] as const;

export const DELIVERY_STATUSES = ['queued', 'sending', 'sent', 'delivered', 'failed', 'bounced'] as const;
