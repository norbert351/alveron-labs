import type { FastifyInstance } from 'fastify';
import { pool, logActivity } from '../db.ts';
import { enqueueJob } from '../queue.ts';
import { createJobForCompany, getActiveJob } from '../modules/pipeline.ts';
import { assertSafeUrl } from '../ssrf.ts';

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
    try {
      await assertSafeUrl(website);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message });
    }

    // Duplicate guard: same website or name already exists
    const dup = await pool.query(
      `SELECT id FROM companies WHERE lower(website) = lower($1) OR lower(name) = lower($2) LIMIT 1`,
      [website, name]
    );
    if ((dup.rowCount ?? 0) > 0) {
      const existingId = dup.rows[0].id;
      const active = await getActiveJob(existingId);
      return reply.code(409).send({
        error: 'Company already exists',
        company_id: existingId,
        active_job: Boolean(active),
        job: active,
      });
    }

    const res = await pool.query(
      `INSERT INTO companies (name, website, notes, stage) VALUES ($1, $2, $3, 'Discovered') RETURNING *`,
      [name, website, notes]
    );
    const company = res.rows[0];
    await logActivity({ actor: 'dashboard', action: 'company_created', entityType: 'company', entityId: company.id });
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

    const [scanRes, reportRes, oppsRes, proposalsRes, outreachRes, jobRes, activityRes] = await Promise.all([
      pool.query(`SELECT * FROM website_scans WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [id]),
      pool.query(`SELECT * FROM research_reports WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [id]),
      pool.query(`SELECT * FROM opportunities WHERE company_id = $1 ORDER BY score DESC NULLS LAST, confidence DESC`, [id]),
      pool.query(`SELECT * FROM proposals WHERE company_id = $1 ORDER BY created_at DESC`, [id]),
      pool.query(`SELECT * FROM outreach WHERE company_id = $1 ORDER BY created_at DESC`, [id]),
      pool.query(`SELECT * FROM jobs WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [id]),
      pool.query(`SELECT * FROM activity_logs WHERE entity_type = 'company' AND entity_id = $1 ORDER BY created_at DESC LIMIT 30`, [id]),
    ]);

    reply.send({
      company,
      scan: scanRes.rows[0] || null,
      report: reportRes.rows[0] || null,
      opportunities: oppsRes.rows,
      proposals: proposalsRes.rows,
      outreach: outreachRes.rows,
      job: jobRes.rows[0] || null,
      activity: activityRes.rows,
    });
  });

  // CRM stage change with activity history
  app.patch('/api/companies/:id/stage', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body: any = req.body || {};
    const stage = String(body.stage || '').trim();
    const allowed = ['Discovered', 'Researching', 'Qualified', 'Proposal Ready', 'Approved', 'Contacted', 'Replied', 'Meeting', 'Won', 'Lost'];
    if (!allowed.includes(stage)) {
      return reply.code(400).send({ error: `stage must be one of: ${allowed.join(', ')}` });
    }
    const current = await pool.query(`SELECT stage FROM companies WHERE id = $1`, [id]);
    if (current.rowCount === 0) return reply.code(404).send({ error: 'Company not found' });
    const from = current.rows[0].stage;
    const res = await pool.query(
      `UPDATE companies SET stage = $2, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, stage]
    );
    await pool.query(
      `INSERT INTO activity_logs (actor, action, entity_type, entity_id, detail) VALUES ($1, 'stage_changed', 'company', $2, $3)`,
      [body.actor || 'dashboard', id, JSON.stringify({ from, to: stage, note: body.note || null })]
    );
    reply.send({ company: res.rows[0], from, to: stage });
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
    const active = await getActiveJob(id);
    if (active) {
      return reply.code(409).send({ error: 'An analysis job is already running for this company', job: active });
    }
    const job = await createJobForCompany(id);
    enqueueJob(job.id);
    reply.code(201).send({ job });
  });

  app.delete('/api/companies/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const res = await pool.query(`DELETE FROM companies WHERE id = $1 RETURNING id`, [id]);
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Company not found' });
    await logActivity({ actor: 'dashboard', action: 'company_deleted', entityType: 'company', entityId: id });
    reply.send({ ok: true, deleted_id: id });
  });
}
