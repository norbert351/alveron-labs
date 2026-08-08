import type { FastifyInstance } from 'fastify';
import { pool, getSetting, logActivity } from '../db.ts';
import { enqueueJob } from '../queue.ts';
import { createJobForCompany, getActiveJob } from '../modules/pipeline.ts';
import { generateProposal } from '../modules/ProposalGeneration.ts';
import { generateOutreach } from '../modules/Outreach.ts';
import { assertSafeUrl } from '../ssrf.ts';
import { DELIVERY_STATUSES } from '../config.ts';

/**
 * Webhook endpoints for n8n and the email provider.
 * Authenticated with X-Webhook-Key (see plugins/security.ts).
 * The dashboard never calls these.
 */

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

async function createCompanyWithGuard(body: any) {
  const name = String(body.name || '').trim();
  const website = normalizeWebsite(String(body.website || ''));
  if (!name || !website) throw new Error('name and a valid website are required');
  await assertSafeUrl(website); // SSRF check at submission time

  const dup = await pool.query(
    `SELECT * FROM companies WHERE lower(website) = lower($1) OR lower(name) = lower($2) LIMIT 1`,
    [website, name]
  );
  if ((dup.rowCount ?? 0) > 0) {
    const company = dup.rows[0];
    const active = await getActiveJob(company.id);
    return { company, job: active, duplicate: true, activeJob: Boolean(active) };
  }

  const res = await pool.query(
    `INSERT INTO companies (name, website, notes, stage) VALUES ($1, $2, $3, 'Discovered') RETURNING *`,
    [name, website, String(body.notes || '').trim()]
  );
  const company = res.rows[0];
  await logActivity({ actor: 'webhook', action: 'company_created', entityType: 'company', entityId: company.id });
  const job = await createJobForCompany(company.id);
  enqueueJob(job.id);
  return { company, job, duplicate: false, activeJob: true };
}

export function registerWebhookRoutes(app: FastifyInstance) {
  // 1. Create company (+ start analysis unless duplicate with active job)
  app.post('/api/webhook/company', async (req, reply) => {
    try {
      const result = await createCompanyWithGuard(req.body || {});
      return reply.code(result.duplicate ? 200 : 201).send(result);
    } catch (e: any) {
      return reply.code(400).send({ error: e.message || 'Invalid request' });
    }
  });

  // 2. Analysis status
  app.get('/api/webhook/company/:id/status', async (req, reply) => {
    const id = Number((req.params as any).id);
    const [cRes, jRes] = await Promise.all([
      pool.query(`SELECT id, name, website, status, stage FROM companies WHERE id = $1`, [id]),
      pool.query(`SELECT * FROM jobs WHERE company_id = $1 ORDER BY id DESC LIMIT 1`, [id]),
    ]);
    if (cRes.rowCount === 0) return reply.code(404).send({ error: 'Company not found' });
    reply.send({ company: cRes.rows[0], job: jRes.rows[0] || null });
  });

  // 3. Completed research
  app.get('/api/webhook/company/:id/research', async (req, reply) => {
    const id = Number((req.params as any).id);
    const res = await pool.query(
      `SELECT * FROM research_reports WHERE company_id = $1 ORDER BY id DESC LIMIT 1`,
      [id]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'No research report yet' });
    const company = (await pool.query(`SELECT id, name, industry, products_services, target_customers, main_offering, technologies FROM companies WHERE id = $1`, [id])).rows[0];
    reply.send({ report: res.rows[0], company });
  });

  // 4. Opportunities
  app.get('/api/webhook/company/:id/opportunities', async (req, reply) => {
    const id = Number((req.params as any).id);
    const res = await pool.query(
      `SELECT * FROM opportunities WHERE company_id = $1 ORDER BY score DESC NULLS LAST, confidence DESC`,
      [id]
    );
    reply.send({ opportunities: res.rows });
  });

  // 5. Generate proposal for an opportunity
  app.post('/api/webhook/opportunity/:id/proposal', async (req, reply) => {
    const oppId = Number((req.params as any).id);
    const oppRes = await pool.query(
      `SELECT o.*, c.name AS company_name, c.website AS company_website, c.industry
       FROM opportunities o JOIN companies c ON c.id = o.company_id WHERE o.id = $1`,
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft') RETURNING *`,
      [opp.company_id, oppId, proposal.opening, proposal.observed_opportunity, proposal.evidence,
       proposal.suggested_solution, proposal.expected_benefit, proposal.next_step]
    );
    await pool.query(`UPDATE opportunities SET status = 'proposed' WHERE id = $1`, [oppId]);
    await pool.query(`UPDATE companies SET status = 'proposed', stage = 'Proposal Ready', updated_at = now() WHERE id = $1`, [opp.company_id]);
    reply.code(201).send({ proposal: res.rows[0] });
  });

  // 6. Get proposal
  app.get('/api/webhook/proposal/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const res = await pool.query(
      `SELECT p.*, c.name AS company_name, o.problem AS opportunity_problem, o.matched_service
       FROM proposals p JOIN companies c ON c.id = p.company_id
       LEFT JOIN opportunities o ON o.id = p.opportunity_id WHERE p.id = $1`,
      [id]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Proposal not found' });
    reply.send({ proposal: res.rows[0] });
  });

  // 7. Request approval (human must still confirm in the dashboard)
  app.post('/api/webhook/outreach/:id/approve', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body: any = req.body || {};
    const res = await pool.query(
      `UPDATE outreach SET approval_status = 'pending' WHERE id = $1 AND status = 'draft' RETURNING *`,
      [id]
    );
    if (res.rowCount === 0) return reply.code(409).send({ error: 'Outreach not in draft state' });
    await logActivity({ actor: 'webhook', action: 'approval_requested', entityType: 'outreach', entityId: id });
    reply.send({ outreach: res.rows[0], note: 'Approval requested. A human must approve in the dashboard before sending.' });
  });

  // 8. Generate outreach email for a proposal (draft)
  app.post('/api/webhook/proposal/:id/outreach', async (req, reply) => {
    const propId = Number((req.params as any).id);
    const propRes = await pool.query(
      `SELECT p.*, c.name AS company_name, c.website AS company_website, c.industry, o.matched_service
       FROM proposals p JOIN companies c ON c.id = p.company_id
       LEFT JOIN opportunities o ON o.id = p.opportunity_id WHERE p.id = $1`,
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
      `INSERT INTO outreach (company_id, proposal_id, subject, body, target_company,
         recommended_service, reason, status, approval_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', 'pending') RETURNING *`,
      [p.company_id, propId, email.subject, email.body, p.company_name,
       p.matched_service || 'Custom Software', email.reason]
    );
    reply.code(201).send({ outreach: res.rows[0] });
  });

  // 9. Record outreach delivery status (called by n8n / email provider)
  app.post('/api/webhook/outreach/:id/message', async (req, reply) => {
    const outreachId = Number((req.params as any).id);
    const body: any = req.body || {};
    const status = String(body.status || '').toLowerCase();
    if (!DELIVERY_STATUSES.includes(status as any)) {
      return reply.code(400).send({ error: `status must be one of: ${DELIVERY_STATUSES.join(', ')}` });
    }
    const outreachRes = await pool.query(`SELECT * FROM outreach WHERE id = $1`, [outreachId]);
    if (outreachRes.rowCount === 0) return reply.code(404).send({ error: 'Outreach not found' });

    let message = await pool.query(
      `SELECT * FROM outreach_messages WHERE outreach_id = $1 ORDER BY id DESC LIMIT 1`,
      [outreachId]
    );
    let messageId: number;
    if (message.rowCount === 0) {
      const created = await pool.query(
        `INSERT INTO outreach_messages (outreach_id, provider, provider_message_id, status, attempts)
         VALUES ($1, $2, $3, $4, 0) RETURNING id`,
        [outreachId, body.provider || 'n8n', body.provider_message_id || null, status]
      );
      messageId = created.rows[0].id;
    } else {
      messageId = message.rows[0].id;
      const fields: string[] = [];
      const params: any[] = [messageId];
      if (body.provider_message_id) { params.push(String(body.provider_message_id)); fields.push(`provider_message_id = $${params.length}`); }
      if (body.provider) { params.push(String(body.provider)); fields.push(`provider = $${params.length}`); }
      if (status) { params.push(status); fields.push(`status = $${params.length}`); }
      if (body.error) { params.push(String(body.error)); fields.push(`last_error = $${params.length}`); }
      if (body.attempts != null) { params.push(Number(body.attempts)); fields.push(`attempts = $${params.length}`); }
      if (status === 'sent') fields.push(`sent_at = now()`);
      if (status === 'delivered') fields.push(`delivered_at = now()`);
      fields.push(`updated_at = now()`);
      await pool.query(`UPDATE outreach_messages SET ${fields.join(', ')} WHERE id = $1`, params);
    }

    await pool.query(
      `INSERT INTO outreach_events (outreach_id, message_id, event, detail) VALUES ($1, $2, $3, $4)`,
      [outreachId, messageId, status, JSON.stringify({ provider_message_id: body.provider_message_id || null, error: body.error || null })]
    );

    if (status === 'sent') {
      await pool.query(`UPDATE outreach SET status = 'sent', sent_at = now() WHERE id = $1`, [outreachId]);
      await pool.query(`UPDATE companies SET status = 'outreach', stage = 'Contacted', updated_at = now() WHERE id = $1`,
        [(await pool.query(`SELECT company_id FROM outreach WHERE id = $1`, [outreachId])).rows[0].company_id]);
      await logActivity({ actor: 'n8n', action: 'email_sent', entityType: 'outreach', entityId: outreachId });
      const fresh = await startFollowUpSequence(outreachId);
      // Only advance the sequence on FOLLOW-UP sends; the initial send created it
      if (!fresh) await advanceFollowUp(outreachId);
    }
    if (status === 'delivered') {
      await logActivity({ actor: 'email-provider', action: 'email_delivered', entityType: 'outreach', entityId: outreachId });
    }
    if (status === 'failed' || status === 'bounced') {
      await pool.query(`UPDATE outreach SET status = $2 WHERE id = $1`, [outreachId, status]);
      await logActivity({ actor: 'email-provider', action: `email_${status}`, entityType: 'outreach', entityId: outreachId, detail: { error: body.error || null } });
    }

    reply.send({ ok: true, messageId, status });
  });

  // 10. Email provider delivery webhook (generic callback)
  app.post('/api/webhook/email-status', async (req, reply) => {
    const body: any = req.body || {};
    const outreachId = Number(body.outreach_id || body.outreachId);
    if (!outreachId) return reply.code(400).send({ error: 'outreach_id is required' });
    return recordEmailStatus(reply, outreachId, body);
  });

  // 11. Reply received → stops follow-ups, moves stage
  app.post('/api/webhook/reply', async (req, reply) => {
    const body: any = req.body || {};
    const outreachId = Number(body.outreach_id);
    if (!outreachId) return reply.code(400).send({ error: 'outreach_id is required' });
    const oRes = await pool.query(`SELECT company_id FROM outreach WHERE id = $1`, [outreachId]);
    if (oRes.rowCount === 0) return reply.code(404).send({ error: 'Outreach not found' });
    const companyId = oRes.rows[0].company_id;
    await pool.query(`UPDATE companies SET stage = 'Replied', updated_at = now() WHERE id = $1`, [companyId]);
    await pool.query(
      `UPDATE follow_up_sequences SET status = 'cancelled', stop_reason = 'replied', updated_at = now() WHERE outreach_id = $1 AND status IN ('pending','running')`,
      [outreachId]
    );
    await pool.query(
      `INSERT INTO outreach_events (outreach_id, event, detail) VALUES ($1, 'replied', $2)`,
      [outreachId, JSON.stringify({ excerpt: body.excerpt || null })]
    );
    await logActivity({ actor: 'n8n', action: 'reply_received', entityType: 'outreach', entityId: outreachId });
    reply.send({ ok: true, stage: 'Replied', follow_ups_stopped: true });
  });

  // 12. Workflow run monitoring
  app.post('/api/webhook/workflow-run', async (req, reply) => {
    const body: any = req.body || {};
    const workflowName = String(body.workflow_name || body.workflowName || '').trim();
    if (!workflowName) return reply.code(400).send({ error: 'workflow_name is required' });
    const status = String(body.status || 'started');
    const res = await pool.query(
      `INSERT INTO workflow_runs (workflow_name, n8n_run_id, status, trigger, retry_count, last_error, payload, started_at, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        workflowName,
        body.n8n_run_id ? String(body.n8n_run_id) : null,
        status,
        body.trigger ? String(body.trigger) : null,
        Number(body.retry_count || 0),
        body.last_error ? String(body.last_error) : null,
        JSON.stringify(body.payload || {}),
        body.started_at || (status === 'started' ? new Date().toISOString() : null),
        body.completed_at || (status === 'completed' || status === 'failed' || status === 'cancelled' ? new Date().toISOString() : null),
      ]
    );
    reply.code(201).send({ run: res.rows[0] });
  });

  // 13. Follow-up configuration for n8n
  app.get('/api/webhook/follow-up-config', async (_req, reply) => {
    const config = (await getSetting('follow_up')) || { enabled: true, days: [0, 4, 9], max_follow_ups: 2 };
    reply.send({ follow_up: config });
  });

  // 13b. Approved outreach waiting in the queue for n8n to send
  app.get('/api/webhook/outreach-queue', async (_req, reply) => {
    const cfg = (await getSetting('email')) || { from_name: 'Alveron Labs', from_email: '' };
    const res = await pool.query(
      `SELECT o.id AS outreach_id, o.subject, o.body, o.target_company, o.recommended_service,
              m.id AS message_id, m.status AS message_status
       FROM outreach_messages m JOIN outreach o ON o.id = m.outreach_id
       WHERE o.status = 'approved' AND m.status = 'queued'
       ORDER BY m.id LIMIT 20`
    );
    reply.send({ items: res.rows, sender: { from_name: cfg.from_name, from_email: cfg.from_email } });
  });

  // 13c. Follow-ups due today for n8n
  app.get('/api/webhook/follow-up-due', async (_req, reply) => {
    const cfg = (await getSetting('follow_up')) || { enabled: true, days: [0, 4, 9], max_follow_ups: 2 };
    if (cfg.enabled === false) return reply.send({ items: [] });
    const days: number[] = (cfg.days || [0, 4, 9]).filter((d: any) => Number.isFinite(Number(d))).map(Number);
    const maxSteps = Math.max(0, Number(cfg.max_follow_ups ?? days.length - 1));
    const res = await pool.query(
      `SELECT f.id AS sequence_id, f.outreach_id, f.current_step, f.steps,
              o.subject, o.body, o.target_company, o.recommended_service, o.sent_at
       FROM follow_up_sequences f JOIN outreach o ON o.id = f.outreach_id
       WHERE f.status = 'running' AND f.current_step < $1
       ORDER BY o.sent_at`
    );
    const now = Date.now();
    const due: any[] = [];
    for (const row of res.rows) {
      const steps: any[] = Array.isArray(row.steps) ? row.steps : [];
      const sentAt = new Date(row.sent_at || row.created_at).getTime();
      // next pending step index
      const nextIdx = steps.findIndex((s) => s.status === 'pending');
      if (nextIdx === -1) continue;
      const step = steps[nextIdx];
      const day = Number(step.day ?? days[nextIdx] ?? 0);
      const dueAt = sentAt + day * 86400000;
      if (now >= dueAt) {
        due.push({ sequence_id: row.sequence_id, outreach_id: row.outreach_id, step_index: nextIdx, day, subject: row.subject, body: row.body, target_company: row.target_company, recommended_service: row.recommended_service });
      }
    }
    reply.send({ items: due.slice(0, 20) });
  });

  // 14. Lead discovery batch (controlled sources only)
  app.post('/api/webhook/leads', async (req, reply) => {
    const body: any = req.body || {};
    const source = String(body.source || '').trim();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!source || items.length === 0) return reply.code(400).send({ error: 'source and items are required' });
    if (items.length > 100) return reply.code(400).send({ error: 'max 100 leads per batch' });

    const sourceRes = await pool.query(`SELECT id FROM lead_sources WHERE name = $1`, [source]);
    if (sourceRes.rowCount === 0) {
      await pool.query(`INSERT INTO lead_sources (name, kind) VALUES ($1, 'webhook')`, [source]);
    }

    const created: any[] = [];
    const duplicates: any[] = [];
    for (const item of items) {
      const name = String(item.name || '').trim();
      const website = normalizeWebsite(String(item.website || ''));
      if (!name || !website) continue;
      const sourceKey = String(item.source_key || website);
      const dupLead = await pool.query(`SELECT * FROM leads WHERE source = $1 AND source_key = $2`, [source, sourceKey]);
      if ((dupLead.rowCount ?? 0) > 0) { duplicates.push({ name, website, reason: 'existing lead' }); continue; }
      const dupCompany = await pool.query(`SELECT id FROM companies WHERE lower(website) = lower($1)`, [website]);
      if ((dupCompany.rowCount ?? 0) > 0) { duplicates.push({ name, website, reason: 'existing company' }); continue; }
      const leadRes = await pool.query(
        `INSERT INTO leads (source, source_key, name, website, industry, location, company_size, keywords, raw)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          source, sourceKey, name, website,
          item.industry ? String(item.industry) : null,
          item.location ? String(item.location) : null,
          item.company_size ? String(item.company_size) : null,
          JSON.stringify(Array.isArray(item.keywords) ? item.keywords.map(String) : []),
          JSON.stringify(item.raw || {}),
        ]
      );
      created.push(leadRes.rows[0]);
    }
    await logActivity({ actor: 'webhook', action: 'leads_received', entityType: 'lead', detail: { source, created: created.length, duplicates: duplicates.length } });
    reply.code(201).send({ created: created.length, duplicates: duplicates.length, created_leads: created, duplicate_leads: duplicates });
  });
}

async function recordEmailStatus(reply: any, outreachId: number, body: any) {
  // Reuse the same transition logic as the /message endpoint
  const status = String(body.status || 'delivered').toLowerCase();
  if (!DELIVERY_STATUSES.includes(status as any)) {
    return reply.code(400).send({ error: `status must be one of: ${DELIVERY_STATUSES.join(', ')}` });
  }
  await pool.query(
    `INSERT INTO outreach_events (outreach_id, event, detail) VALUES ($1, $2, $3)`,
    [outreachId, status, JSON.stringify({ provider_message_id: body.provider_message_id || null, error: body.error || null })]
  );
  const msgRes = await pool.query(
    `SELECT * FROM outreach_messages WHERE outreach_id = $1 ORDER BY id DESC LIMIT 1`,
    [outreachId]
  );
  if (msgRes.rowCount === 0) {
    await pool.query(
      `INSERT INTO outreach_messages (outreach_id, provider, provider_message_id, status) VALUES ($1, $2, $3, $4)`,
      [outreachId, body.provider || 'email-provider', body.provider_message_id || null, status]
    );
  } else {
    const sets: string[] = [`status = $2`, `updated_at = now()`];
    const params: any[] = [msgRes.rows[0].id, status];
    if (body.provider_message_id) { params.push(String(body.provider_message_id)); sets.push(`provider_message_id = $${params.length}`); }
    if (body.error) { params.push(String(body.error)); sets.push(`last_error = $${params.length}`); }
    if (status === 'sent') sets.push(`sent_at = now()`);
    if (status === 'delivered') sets.push(`delivered_at = now()`);
    await pool.query(`UPDATE outreach_messages SET ${sets.join(', ')} WHERE id = $1`, params);
  }
  reply.send({ ok: true, status });
}

async function startFollowUpSequence(outreachId: number): Promise<boolean> {
  const existing = await pool.query(
    `SELECT id FROM follow_up_sequences WHERE outreach_id = $1 LIMIT 1`,
    [outreachId]
  );
  if ((existing.rowCount ?? 0) > 0) return false; // already created on the initial send
  const cfg = (await getSetting('follow_up')) || { enabled: true, days: [0, 4, 9], max_follow_ups: 2 };
  const days: number[] = Array.isArray(cfg.days) ? cfg.days.filter((d: any) => Number.isFinite(Number(d))).map(Number) : [0, 4, 9];
  const steps = days.map((d, i) => ({ step: i, day: d, status: i === 0 ? 'sent' : 'pending' }));
  await pool.query(
    `INSERT INTO follow_up_sequences (outreach_id, status, current_step, steps)
     VALUES ($1, $2, $3, $4)`,
    [outreachId, cfg.enabled === false ? 'paused' : 'running', 1, JSON.stringify(steps)]
  );
  return true;
}

async function advanceFollowUp(outreachId: number) {
  const seqRes = await pool.query(
    `SELECT * FROM follow_up_sequences WHERE outreach_id = $1 ORDER BY id DESC LIMIT 1`,
    [outreachId]
  );
  if (seqRes.rowCount === 0) return;
  const seq = seqRes.rows[0];
  if (seq.status !== 'running') return;
  const steps: any[] = Array.isArray(seq.steps) ? seq.steps : [];
  const idx = steps.findIndex((s: any) => s.status === 'pending');
  if (idx === -1) {
    await pool.query(`UPDATE follow_up_sequences SET status = 'completed', updated_at = now() WHERE id = $1`, [seq.id]);
    return;
  }
  steps[idx] = { ...steps[idx], status: 'sent' };
  const nextIdx = steps.findIndex((s: any) => s.status === 'pending');
  await pool.query(
    `UPDATE follow_up_sequences SET steps = $2, current_step = $3, status = $4, updated_at = now() WHERE id = $1`,
    [seq.id, JSON.stringify(steps), nextIdx === -1 ? steps.length : nextIdx, nextIdx === -1 ? 'completed' : 'running']
  );
}
