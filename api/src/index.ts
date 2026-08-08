import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDb } from './db.ts';
import { config } from './config.ts';
import { registerCompanyRoutes } from './routes/companies.ts';
import { registerOpportunityRoutes } from './routes/opportunities.ts';
import { registerProposalRoutes } from './routes/proposals.ts';
import { registerOutreachRoutes } from './routes/outreach.ts';
import { registerSettingsRoutes } from './routes/settings.ts';
import { registerOverviewRoutes } from './routes/overview.ts';

async function main() {
  await initDb();
  console.log('[alveron-api] database ready');

  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({ ok: true, service: 'alveron-labs-api' }));

  registerCompanyRoutes(app);
  registerOpportunityRoutes(app);
  registerProposalRoutes(app);
  registerOutreachRoutes(app);
  registerSettingsRoutes(app);
  registerOverviewRoutes(app);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[alveron-api] listening on http://0.0.0.0:${config.port}`);
}

main().catch((err) => {
  console.error('[alveron-api] fatal:', err);
  process.exit(1);
});
