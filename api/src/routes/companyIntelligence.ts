import type { FastifyInstance } from 'fastify';
import { runCompanyIntelligence, runAllCompanyIntelligence, listCompanyIntelligenceFindings, listCompanyDiscoveryCandidates } from '../opportunities/companyIntelligence.ts';

export function registerCompanyIntelligenceRoutes(app: FastifyInstance) {
  let batchInProgress = false;
  app.post('/api/webhook/company-intelligence-discovery', async (_req, reply) => {
    if (batchInProgress) return reply.code(409).send({ error: 'Company intelligence batch is already running' });
    batchInProgress = true;
    try {
      return reply.send(await runAllCompanyIntelligence());
    } finally {
      batchInProgress = false;
    }
  });

  app.get('/api/company-intelligence/candidates', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const candidates = await listCompanyDiscoveryCandidates(Number(query.limit) || 100);
    return reply.send({ candidates, total: candidates.length });
  });

  app.post('/api/companies/:id/intelligence/run', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid company id' });
    try {
      return reply.send(await runCompanyIntelligence(id));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Research failed';
      return reply.code(message === 'Company not found' ? 404 : 502).send({ error: message });
    }
  });

  app.get('/api/companies/:id/intelligence/findings', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid company id' });
    const query = req.query as Record<string, string | undefined>;
    const findings = await listCompanyIntelligenceFindings(id, Number(query.limit) || 100);
    return reply.send({ findings, total: findings.length });
  });
}
