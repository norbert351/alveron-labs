import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';
import { enqueueJob } from '../queue.ts';
import { createJobForCompany } from '../modules/pipeline.ts';

function normalizeWebsite(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  const withProto = /^https?:\/\//i.test(url) ? url : 'https://' + url;
  try {
    const u = new URL(withProto);
    if (!u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

export function registerCompanyRoutes(app: FastifyInstance) {
  app.post('/api/companies', async (req, reply) => {
    const body: any = req.body || {};
    const name = String(body.name || '').trim();
    const website = normalizeWebsite(String(body.website || ''));
    const notes = String(body.notes || '').trim();

    if (!name) return reply.code(400).send({ error: 'Company name is required' });
    if (!website) return reply.code(400).send({ error: 'A valid website URL is required' });

    const res = await pool.query(
      `INSERT INTO companies (name, website, notes) VALUES ($1, $2, $3) RETURNING *`,
      [name, website, notes]
    );
    const company = res.rows[0];
    const job = await createJobForCompany(company.id);
    enqueueJob(job.id);
    reply.code(201).send({ company, job });
  });

  app.get('/api/companies', async (req, reply) => {
    const { status } = req.query as any;
    const params: any[] = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE c.status = $${params.length}`;
    }
    const res = await pool.query(
      `SELECT c.*,
        (SELECT count(*) FROM opportunities o WHERE o.company_id = c.id) AS opportunity_count,
        (SELECT count(*) FROM proposals p WHERE p.company_id = c.id) AS proposal_count,
        (SELECT count(*) FROM outreach ot WHERE ot.company_id = c.id) AS outreach_count
       FROM companies c ${where}
       ORDER BY c.created_at DESC`,
      params
    );
    reply.send({ companies: res.rows });
  });

  app.get('/api/companies/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const companyRes = await pool.query(`SELECT * FROM companies WHERE id = $1`, [id]);
    if (companyRes.rowCount === 0) return reply.code(404).send({ error: 'Company not found' });
    const company = companyRes.rows[0];

    const [scanRes, reportRes, oppsRes, proposalsRes, outreachRes, jobRes] = await Promise.all([
      pool.query(`SELECT * FROM website_scans WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [id]),
      pool.query(`SELECT * FROM research_reports WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [id]),
      pool.query(`SELECT * FROM opportunities WHERE company_id = $1 ORDER BY confidence DESC`, [id]),
      pool.query(`SELECT * FROM proposals WHERE company_id = $1 ORDER BY created_at DESC`, [id]),
      pool.query(`SELECT * FROM outreach WHERE company_id = $1 ORDER BY created_at DESC`, [id]),
      pool.query(`SELECT * FROM jobs WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [id]),
    ]);

    reply.send({
      company,
      scan: scanRes.rows[0] || null,
      report: reportRes.rows[0] || null,
      opportunities: oppsRes.rows,
      proposals: proposalsRes.rows,
      outreach: outreachRes.rows,
      job: jobRes.rows[0] || null,
    });
  });

  app.patch('/api/companies/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body: any = req.body || {};
    const res = await pool.query(
      `UPDATE companies SET
         name = COALESCE($2, name),
         website = COALESCE($3, website),
         notes = COALESCE($4, notes),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        body.name != null ? String(body.name).trim() : null,
        body.website != null ? normalizeWebsite(String(body.website)) : null,
        body.notes != null ? String(body.notes).trim() : null,
      ]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Company not found' });
    reply.send({ company: res.rows[0] });
  });

  app.post('/api/companies/:id/reanalyze', async (req, reply) => {
    const id = Number((req.params as any).id);
    const companyRes = await pool.query(`SELECT id FROM companies WHERE id = $1`, [id]);
    if (companyRes.rowCount === 0) return reply.code(404).send({ error: 'Company not found' });
    const job = await createJobForCompany(id);
    enqueueJob(job.id);
    reply.code(201).send({ job });
  });
}
