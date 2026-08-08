import Fastify from 'fastify';
import cors from '@fastify/cors';
import { initDb, pool } from './db.ts';
import { config } from './config.ts';
import { registerSecurity } from './plugins/security.ts';
import { registerCompanyRoutes } from './routes/companies.ts';
import { registerOpportunityRoutes } from './routes/opportunities.ts';
import { registerProposalRoutes } from './routes/proposals.ts';
import { registerOutreachRoutes } from './routes/outreach.ts';
import { registerSettingsRoutes } from './routes/settings.ts';
import { registerOverviewRoutes } from './routes/overview.ts';
import { registerWebhookRoutes } from './routes/webhooks.ts';
import { registerWorkflowRoutes } from './routes/workflows.ts';
import { registerAuthRoutes } from './routes/auth.ts';
import { registerEmailAccountRoutes } from './routes/emailAccounts.ts';
import { registerLeadSourceRoutes } from './routes/leadSources.ts';

async function main() {
  await initDb();
  // Reset jobs orphaned by a restart so duplicate-job guards never block re-analysis
  await pool.query(
    `UPDATE jobs SET status = 'failed', error = 'API restarted while job was active', updated_at = now()
     WHERE status IN ('pending', 'running')`
  );
  await pool.query(
    `UPDATE website_scans SET status = 'failed', error = 'API restarted while scan was active'
     WHERE status IN ('pending', 'running')`
  );
  await pool.query(
    `UPDATE research_reports SET status = 'failed', error = 'API restarted while report was active'
     WHERE status IN ('pending', 'running')`
  );
  console.log('[alveron-api] database ready');

  const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });
  // CSV import support
  app.addContentTypeParser('text/csv', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });
  await app.register(cors, { origin: true });
  await registerSecurity(app);

  app.get('/api/health', async () => ({ ok: true, service: 'alveron-labs-api' }));

  registerCompanyRoutes(app);
  registerOpportunityRoutes(app);
  registerProposalRoutes(app);
  registerOutreachRoutes(app);
  registerSettingsRoutes(app);
  registerOverviewRoutes(app);
  registerWorkflowRoutes(app);
  registerWebhookRoutes(app);
  registerAuthRoutes(app);
  registerEmailAccountRoutes(app);
  registerLeadSourceRoutes(app);

  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`[alveron-api] listening on http://0.0.0.0:${config.port}`);
}

main().catch((err) => {
  console.error('[alveron-api] fatal:', err);
  process.exit(1);
});
