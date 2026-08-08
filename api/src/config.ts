import 'dotenv/config';

export const config = {
  port: Number(process.env.ALVERON_PORT || process.env.PORT || 3100),
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://alveron:alveron_dev_pw@127.0.0.1:5433/alveron',
  llm: {
    baseUrl: process.env.ALVERON_LLM_BASE_URL || 'https://agentrouter.org/v1',
    apiKey: process.env.ALVERON_LLM_API_KEY || '',
    model: process.env.ALVERON_LLM_MODEL || 'gpt-5.6-terra',
    timeoutMs: Number(process.env.ALVERON_LLM_TIMEOUT_MS || 180000),
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

export const DEFAULT_SERVICE_CATALOG: { name: string; description: string }[] = [
  { name: 'AI Automation', description: 'Automating repetitive business workflows with AI' },
  { name: 'AI Agents', description: 'Autonomous AI agents for research, support, and operations' },
  { name: 'Custom Software', description: 'Bespoke internal tools and business software' },
  { name: 'SaaS Development', description: 'Multi-tenant SaaS products and platforms' },
  { name: 'Web Applications', description: 'Modern web apps, portals, and dashboards' },
  { name: 'Web3 Solutions', description: 'Smart contracts, dApps, and blockchain integrations' },
];
