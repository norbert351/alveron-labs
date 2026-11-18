import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';
import { assertSafeUrl } from '../ssrf.ts';
import { runCompanyIntelligence, runAllCompanyIntelligence, listCompanyIntelligenceFindings, listCompanyDiscoveryCandidates, getLatestCompanyIntelligenceReport } from '../opportunities/companyIntelligence.ts';

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

  app.patch('/api/company-intelligence/candidates/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const status = String(((req.body || {}) as any).status || '');
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid candidate id' });
    if (!['reviewing', 'rejected'].includes(status)) return reply.code(400).send({ error: 'status must be reviewing or rejected' });
    const result = await pool.query(
      `UPDATE company_discovery_candidates SET status=$2, reviewed_at=now() WHERE id=$1 AND status <> 'promoted' RETURNING *`,
      [id, status]
    );
    if (!result.rowCount) return reply.code(404).send({ error: 'Candidate not found or already promoted' });
    return reply.send({ candidate: result.rows[0] });
  });

  app.post('/api/company-intelligence/candidates/:id/promote', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = (req.body || {}) as Record<string, unknown>;
    const name = String(body.name || '').trim().slice(0, 240);
    const rawWebsite = String(body.website || '').trim();
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid candidate id' });
    if (!name || !rawWebsite) return reply.code(400).send({ error: 'A company name and verified website are required' });
    const website = rawWebsite.startsWith('http://') || rawWebsite.startsWith('https://') ? rawWebsite : 'https://' + rawWebsite;
    let parsed: URL;
    try { parsed = new URL(website); } catch { return reply.code(400).send({ error: 'Invalid website URL' }); }
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) return reply.code(400).send({ error: 'Invalid website URL' });
    try { await assertSafeUrl(parsed.toString()); } catch { return reply.code(400).send({ error: 'Website failed SSRF safety validation' }); }
    const candidate = await pool.query('SELECT id, status FROM company_discovery_candidates WHERE id=$1 LIMIT 1', [id]);
    if (!candidate.rowCount || candidate.rows[0].status === 'promoted') return reply.code(404).send({ error: 'Candidate not found or already promoted' });
    const duplicate = await pool.query('SELECT id, name, website FROM companies WHERE lower(website)=lower($1) OR lower(name)=lower($2) LIMIT 1', [parsed.toString(), name]);
    if (duplicate.rowCount) return reply.code(409).send({ error: 'Company already exists', company: duplicate.rows[0] });
    const created = await pool.query(
      `INSERT INTO companies (name, website, notes, stage) VALUES ($1,$2,$3,'Discovered') RETURNING id,name,website,stage,created_at`,
      [name, parsed.toString(), 'Promoted from public company discovery candidate #' + id]
    );
    await pool.query(`UPDATE company_discovery_candidates SET status='promoted', reviewed_at=now() WHERE id=$1`, [id]);
    return reply.code(201).send({ company: created.rows[0], note: 'Company added after human verification. Run company intelligence to investigate it.' });
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

  app.get('/api/companies/:id/intelligence/report', async (req, reply) => {\n    const id = Number((req.params as any).id);\n    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid company id' });\n    const report = await getLatestCompanyIntelligenceReport(id);\n    if (!report) return reply.code(404).send({ error: 'No local AI report yet. Configure Ollama and run company intelligence.' });\n    return reply.send({ report });\n  });\n\n  app.get('/api/companies/:id/intelligence/findings', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid company id' });
    const query = req.query as Record<string, string | undefined>;
    const findings = await listCompanyIntelligenceFindings(id, Number(query.limit) || 100);
    return reply.send({ findings, total: findings.length });
  });
}
