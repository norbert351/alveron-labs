import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';
import { generateOutreach } from '../modules/Outreach.ts';

export function registerOutreachRoutes(app: FastifyInstance) {
  app.get('/api/outreach', async (req, reply) => {
    const { company_id, status } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (company_id) {
      params.push(Number(company_id));
      conds.push(`o.company_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conds.push(`o.status = $${params.length}`);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const res = await pool.query(
      `SELECT o.*, c.name AS company_name, c.website AS company_website
       FROM outreach o JOIN companies c ON c.id = o.company_id
       ${where} ORDER BY o.created_at DESC`,
      params
    );
    reply.send({ outreach: res.rows });
  });

  app.get('/api/outreach/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const res = await pool.query(
      `SELECT o.*, c.name AS company_name, c.website AS company_website
       FROM outreach o JOIN companies c ON c.id = o.company_id
       WHERE o.id = $1`,
      [id]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Outreach not found' });
    reply.send({ outreach: res.rows[0] });
  });

  app.post('/api/proposals/:id/outreach', async (req, reply) => {
    const propId = Number((req.params as any).id);
    const propRes = await pool.query(
      `SELECT p.*, c.name AS company_name, c.website AS company_website, c.industry,
              o.matched_service
       FROM proposals p
       JOIN companies c ON c.id = p.company_id
       LEFT JOIN opportunities o ON o.id = p.opportunity_id
       WHERE p.id = $1`,
      [propId]
    );
    if (propRes.rowCount === 0) return reply.code(404).send({ error: 'Proposal not found' });
    const p = propRes.rows[0];

    const email = await generateOutreach({
      companyName: p.company_name,
      website: p.company_website,
      industry: p.industry || '',
      service: p.matched_service || 'Custom Software',
      proposalOpening: p.opening,
      observedOpportunity: p.observed_opportunity,
      suggestedSolution: p.suggested_solution,
      nextStep: p.next_step,
    });

    const res = await pool.query(
      `INSERT INTO outreach
         (company_id, proposal_id, subject, body, target_company,
          recommended_service, reason, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft')
       RETURNING *`,
      [
        p.company_id,
        propId,
        email.subject,
        email.body,
        p.company_name,
        p.matched_service || 'Custom Software',
        email.reason,
      ]
    );
    reply.code(201).send({ outreach: res.rows[0] });
  });

  app.patch('/api/outreach/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body: any = req.body || {};
    const res = await pool.query(
      `UPDATE outreach SET
         subject = COALESCE($2, subject),
         body = COALESCE($3, body),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, body.subject != null ? String(body.subject) : null, body.body != null ? String(body.body) : null]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Outreach not found' });
    reply.send({ outreach: res.rows[0] });
  });

  app.post('/api/outreach/:id/approve', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body: any = req.body || {};
    if (body.confirm !== true) {
      return reply.code(400).send({ error: 'Explicit confirmation is required to approve and send' });
    }
    const res = await pool.query(
      `UPDATE outreach SET status = 'approved', sent_at = now(), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Outreach not found' });
    const o = res.rows[0];
    await pool.query(`UPDATE proposals SET status = 'sent', updated_at = now() WHERE id = $1`, [o.proposal_id]);
    await pool.query(`UPDATE companies SET status = 'outreach', updated_at = now() WHERE id = $1`, [o.company_id]);
    reply.send({ outreach: o, note: 'Approved. MVP does not send real email; status marked sent for tracking.' });
  });

  app.post('/api/outreach/:id/reject', async (req, reply) => {
    const id = Number((req.params as any).id);
    const res = await pool.query(
      `UPDATE outreach SET status = 'rejected', updated_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Outreach not found' });
    reply.send({ outreach: res.rows[0] });
  });
}
