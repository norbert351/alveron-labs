import type { FastifyInstance } from 'fastify';
import { runCompanyIntelligence, listCompanyIntelligenceFindings } from '../opportunities/companyIntelligence.ts';

export function registerCompanyIntelligenceRoutes(app: FastifyInstance) {
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
