import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';

export function registerOpportunityRoutes(app: FastifyInstance) {
  app.get('/api/opportunities', async (req, reply) => {
    const { company_id, status, service } = req.query as any;
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
    if (service) {
      params.push(service);
      conds.push(`o.matched_service = $${params.length}`);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const res = await pool.query(
      `SELECT o.*, c.name AS company_name, c.website AS company_website
       FROM opportunities o JOIN companies c ON c.id = o.company_id
       ${where} ORDER BY o.confidence DESC, o.created_at DESC`,
      params
    );
    reply.send({ opportunities: res.rows });
  });

  app.patch('/api/opportunities/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const { status } = (req.body || {}) as any;
    if (!['open', 'proposed', 'approved', 'rejected'].includes(status)) {
      return reply.code(400).send({ error: 'Invalid status' });
    }
    const res = await pool.query(
      `UPDATE opportunities SET status = $2 WHERE id = $1 RETURNING *`,
      [id, status]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Opportunity not found' });
    reply.send({ opportunity: res.rows[0] });
  });

  app.delete('/api/opportunities/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    await pool.query(`DELETE FROM opportunities WHERE id = $1`, [id]);
    reply.send({ ok: true });
  });
}
