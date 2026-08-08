import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';

export function registerWorkflowRoutes(app: FastifyInstance) {
  // Workflow run monitoring for the dashboard
  app.get('/api/workflow-runs', async (req, reply) => {
    const { workflow_name, status, limit } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (workflow_name) {
      params.push(String(workflow_name));
      conds.push(`workflow_name = $${params.length}`);
    }
    if (status) {
      params.push(String(status));
      conds.push(`status = $${params.length}`);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const max = Math.min(Number(limit) || 50, 200);
    const res = await pool.query(
      `SELECT * FROM workflow_runs ${where} ORDER BY created_at DESC LIMIT $${params.length + 1}`,
      [...params, max]
    );
    reply.send({ runs: res.rows });
  });

  // Lead discovery sources (controlled)
  app.get('/api/lead-sources', async (_req, reply) => {
    const res = await pool.query(`SELECT * FROM lead_sources ORDER BY created_at DESC`);
    reply.send({ sources: res.rows });
  });

  app.post('/api/lead-sources', async (req, reply) => {
    const body: any = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return reply.code(400).send({ error: 'name is required' });
    const res = await pool.query(
      `INSERT INTO lead_sources (name, kind, config) VALUES ($1, $2, $3) ON CONFLICT (name) DO UPDATE SET enabled = true RETURNING *`,
      [name, String(body.kind || 'manual'), JSON.stringify(body.config || {})]
    );
    reply.code(201).send({ source: res.rows[0] });
  });

  // Leads list
  app.get('/api/leads', async (req, reply) => {
    const { source, status, limit } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (source) {
      params.push(String(source));
      conds.push(`source = $${params.length}`);
    }
    if (status) {
      params.push(String(status));
      conds.push(`status = $${params.length}`);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const max = Math.min(Number(limit) || 100, 200);
    const res = await pool.query(
      `SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT $${params.length + 1}`,
      [...params, max]
    );
    reply.send({ leads: res.rows });
  });

  // Promote a lead into a company + research (with duplicate + active-job guard)
  app.post('/api/leads/:id/promote', async (req, reply) => {
    const id = Number((req.params as any).id);
    const leadRes = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
    if (leadRes.rowCount === 0) return reply.code(404).send({ error: 'Lead not found' });
    const lead = leadRes.rows[0];
    if (lead.company_id) {
      return reply.code(409).send({ error: 'Lead already promoted', company_id: lead.company_id });
    }
    const dup = await pool.query(`SELECT id FROM companies WHERE lower(website) = lower($1) LIMIT 1`, [lead.website]);
    if ((dup.rowCount ?? 0) > 0) {
      return reply.code(409).send({ error: 'Company already exists', company_id: dup.rows[0].id });
    }
    const companyRes = await pool.query(
      `INSERT INTO companies (name, website, notes, stage, lead_source)
       VALUES ($1, $2, $3, 'Discovered', $4) RETURNING *`,
      [lead.name, lead.website, `Promoted from lead source: ${lead.source}`, lead.source]
    );
    const company = companyRes.rows[0];
    await pool.query(`UPDATE leads SET company_id = $2, status = 'research' WHERE id = $1`, [id, company.id]);
    const { createJobForCompany } = await import('../modules/pipeline.ts');
    const { enqueueJob } = await import('../queue.ts');
    const job = await createJobForCompany(company.id);
    enqueueJob(job.id);
    reply.code(201).send({ company, job, lead: { ...lead, company_id: company.id, status: 'research' } });
  });
}
