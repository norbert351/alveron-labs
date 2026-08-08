import type { FastifyInstance } from 'fastify';
import { pool, logActivity } from '../db.ts';
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
    const withMessages = await Promise.all(
      res.rows.map(async (o) => {
        const msgRes = await pool.query(
          `SELECT * FROM outreach_messages WHERE outreach_id = $1 ORDER BY id DESC LIMIT 1`,
          [o.id]
        );
        return { ...o, latest_message: msgRes.rows[0] || null };
      })
    );
    reply.send({ outreach: withMessages });
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
    const [events, messages] = await Promise.all([
      pool.query(`SELECT * FROM outreach_events WHERE outreach_id = $1 ORDER BY created_at DESC LIMIT 20`, [id]),
      pool.query(`SELECT * FROM outreach_messages WHERE outreach_id = $1 ORDER BY id DESC`, [id]),
    ]);
    reply.send({ outreach: res.rows[0], events: events.rows, messages: messages.rows });
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
          recommended_service, reason, status, approval_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', 'pending')
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
         edited_before_send = CASE WHEN $2 IS NOT NULL OR $3 IS NOT NULL THEN true ELSE edited_before_send END,
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, body.subject != null ? String(body.subject) : null, body.body != null ? String(body.body) : null]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Outreach not found' });
    await logActivity({ actor: body.actor || 'dashboard', action: 'outreach_edited', entityType: 'outreach', entityId: id });
    reply.send({ outreach: res.rows[0] });
  });

  app.post('/api/outreach/:id/approve', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body: any = req.body || {};
    if (body.confirm !== true) {
      return reply.code(400).send({ error: 'Explicit confirmation is required to approve and send' });
    }
    const approvedBy = String(body.approved_by || '').trim() || 'dashboard-user';
    const user = (req as any).user || null;
    const current = await pool.query(`SELECT * FROM outreach WHERE id = $1`, [id]);
    if (current.rowCount === 0) return reply.code(404).send({ error: 'Outreach not found' });
    const o = current.rows[0];
    if (o.status !== 'draft') {
      return reply.code(409).send({ error: `Outreach already ${o.status}, cannot approve` });
    }

    // approval attribution: user identity, IP, device metadata, email version
    const approvedByUser = user?.id || null;
    const ip = req.ip || '';
    const ua = (req.headers['user-agent'] as string) || '';
    const emailVersion = Number(o.email_version || 1);

    const res = await pool.query(
      `UPDATE outreach SET
         status = 'approved',
         approval_status = 'approved',
         approved_by = $2,
         approved_by_user_id = $3,
         approved_at = now(),
         approval_ip = $4,
         approval_user_agent = $5,
         edited_before_send = COALESCE(edited_before_send, false)
       WHERE id = $1 RETURNING *`,
      [id, approvedBy, approvedByUser, ip, ua.slice(0, 250)]
    );
    const approved = res.rows[0];

    // Queue the delivery message for n8n to pick up (real provider is resolved at send time)
    const msgRes = await pool.query(
      `INSERT INTO outreach_messages (outreach_id, provider, status, attempts, subject, recipient)
       VALUES ($1, NULL, 'queued', 0, $2, $3) RETURNING *`,
      [id, o.subject, o.target_company]
    );
    await pool.query(
      `INSERT INTO outreach_events (outreach_id, message_id, event, detail) VALUES ($1, $2, 'approved', $3)`,
      [id, msgRes.rows[0].id, JSON.stringify({ approved_by: approvedBy, user_id: approvedByUser, ip, email_version: emailVersion })]
    );

    await pool.query(`UPDATE proposals SET status = 'approved', updated_at = now() WHERE id = $1`, [o.proposal_id]);
    await pool.query(`UPDATE companies SET status = 'approved', stage = 'Approved', updated_at = now() WHERE id = $1`, [o.company_id]);
    await logActivity({
      actor: approvedBy,
      action: 'outreach_approved',
      entityType: 'outreach',
      entityId: id,
      detail: { user_id: approvedByUser, ip, email_version: emailVersion, edited_before_send: approved.edited_before_send, proposal_id: o.proposal_id },
    });

    reply.send({
      outreach: approved,
      message: msgRes.rows[0],
      note: 'Approved and queued. n8n will call the send endpoint; the provider must confirm before status becomes sent.',
    });
  });

  app.post('/api/outreach/:id/reject', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body: any = req.body || {};
    const reason = String(body.reason || '').trim();
    const res = await pool.query(
      `UPDATE outreach SET
         status = 'rejected',
         approval_status = 'rejected',
         rejected_reason = $2,
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, reason || null]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Outreach not found' });
    await logActivity({
      actor: body.actor || 'dashboard-user',
      action: 'outreach_rejected',
      entityType: 'outreach',
      entityId: id,
      detail: { reason },
    });
    reply.send({ outreach: res.rows[0] });
  });
}
