import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';
import { generateProposal } from '../modules/ProposalGeneration.ts';

export function registerProposalRoutes(app: FastifyInstance) {
  app.get('/api/proposals', async (req, reply) => {
    const { company_id, status } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (company_id) {
      params.push(Number(company_id));
      conds.push(`p.company_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conds.push(`p.status = $${params.length}`);
    }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const res = await pool.query(
      `SELECT p.*, c.name AS company_name, c.website AS company_website, o.problem AS opportunity_problem
       FROM proposals p
       JOIN companies c ON c.id = p.company_id
       LEFT JOIN opportunities o ON o.id = p.opportunity_id
       ${where} ORDER BY p.created_at DESC`,
      params
    );
    reply.send({ proposals: res.rows });
  });

  app.get('/api/proposals/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const res = await pool.query(
      `SELECT p.*, c.name AS company_name, c.website AS company_website,
              o.problem AS opportunity_problem, o.matched_service
       FROM proposals p
       JOIN companies c ON c.id = p.company_id
       LEFT JOIN opportunities o ON o.id = p.opportunity_id
       WHERE p.id = $1`,
      [id]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Proposal not found' });
    reply.send({ proposal: res.rows[0] });
  });

  app.post('/api/opportunities/:id/proposal', async (req, reply) => {
    const oppId = Number((req.params as any).id);
    const oppRes = await pool.query(
      `SELECT o.*, c.name AS company_name, c.website AS company_website, c.industry
       FROM opportunities o JOIN companies c ON c.id = o.company_id
       WHERE o.id = $1`,
      [oppId]
    );
    if (oppRes.rowCount === 0) return reply.code(404).send({ error: 'Opportunity not found' });
    const opp = oppRes.rows[0];

    const proposal = await generateProposal({
      companyName: opp.company_name,
      website: opp.company_website,
      industry: opp.industry || '',
      problem: opp.problem,
      evidence: opp.evidence,
      business_impact: opp.business_impact,
      solution: opp.recommended_solution,
      expected_benefit: opp.business_impact,
      service: opp.matched_service,
    });

    const res = await pool.query(
      `INSERT INTO proposals
         (company_id, opportunity_id, opening, observed_opportunity, evidence,
          suggested_solution, expected_benefit, next_step, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
       RETURNING *`,
      [
        opp.company_id,
        oppId,
        proposal.opening,
        proposal.observed_opportunity,
        proposal.evidence,
        proposal.suggested_solution,
        proposal.expected_benefit,
        proposal.next_step,
      ]
    );
    await pool.query(`UPDATE opportunities SET status = 'proposed' WHERE id = $1`, [oppId]);
    await pool.query(
      `UPDATE companies SET status = 'proposed', stage = 'Proposal Ready', updated_at = now() WHERE id = $1`,
      [opp.company_id]
    );
    await pool.query(
      `INSERT INTO activity_logs (actor, action, entity_type, entity_id, detail) VALUES ('system', 'stage_changed', 'company', $1, $2)`,
      [opp.company_id, JSON.stringify({ from: 'Qualified', to: 'Proposal Ready', note: 'Proposal generated' })]
    ).catch(() => {});
    reply.code(201).send({ proposal: res.rows[0] });
  });

  app.patch('/api/proposals/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body: any = req.body || {};
    const res = await pool.query(
      `UPDATE proposals SET
         opening = COALESCE($2, opening),
         observed_opportunity = COALESCE($3, observed_opportunity),
         evidence = COALESCE($4, evidence),
         suggested_solution = COALESCE($5, suggested_solution),
         expected_benefit = COALESCE($6, expected_benefit),
         next_step = COALESCE($7, next_step),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        body.opening != null ? String(body.opening) : null,
        body.observed_opportunity != null ? String(body.observed_opportunity) : null,
        body.evidence != null ? String(body.evidence) : null,
        body.suggested_solution != null ? String(body.suggested_solution) : null,
        body.expected_benefit != null ? String(body.expected_benefit) : null,
        body.next_step != null ? String(body.next_step) : null,
      ]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Proposal not found' });
    reply.send({ proposal: res.rows[0] });
  });
}
