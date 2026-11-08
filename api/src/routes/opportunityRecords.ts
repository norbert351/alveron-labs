import type { FastifyInstance } from 'fastify';
import { pool, logActivity } from '../db.ts';

const TYPES = new Set(['remote_job', 'paid_task', 'agency_contract', 'business_lead', 'paid_research', 'technical_content']);
const STATUSES = new Set(['discovered', 'reviewing', 'qualified', 'approved', 'rejected', 'applied', 'closed', 'expired']);
const VERIFICATION = new Set(['unverified', 'partial', 'verified']);

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch { return null; }
}

export function registerUnifiedOpportunityRoutes(app: FastifyInstance) {
  app.get('/api/opportunity-records', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const conditions: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace('?', '$' + params.length));
    };
    if (query.type) {
      if (!TYPES.has(query.type)) return reply.code(400).send({ error: 'Invalid opportunity type' });
      add('o.opportunity_type = ?', query.type);
    }
    if (query.status) {
      if (!STATUSES.has(query.status)) return reply.code(400).send({ error: 'Invalid status' });
      add('o.status = ?', query.status);
    }
    if (query.source) add('o.source_name = ?', query.source.slice(0, 120));
    if (query.search) {
      params.push('%' + query.search.slice(0, 120) + '%');
      conditions.push('(o.title ILIKE $' + params.length + ' OR o.description ILIKE $' + params.length + ' OR o.organization_name ILIKE $' + params.length + ')');
    }
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const offset = Math.max(0, Number(query.offset) || 0);
    params.push(limit, offset);
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const result = await pool.query(
      'SELECT o.*, c.name AS company_name, c.website AS company_website FROM opportunity_records o LEFT JOIN companies c ON c.id = o.company_id ' +
      where + ' ORDER BY CASE WHEN o.deadline_at IS NOT NULL AND o.deadline_at < now() THEN 1 ELSE 0 END, o.fit_score DESC NULLS LAST, o.discovered_at DESC LIMIT $' +
      (params.length - 1) + ' OFFSET $' + params.length,
      params
    );
    return reply.send({ opportunities: result.rows, pagination: { limit, offset } });
  });

  app.post('/api/opportunity-records', async (req, reply) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const type = String(body.opportunity_type || '');
    const title = String(body.title || '').trim().slice(0, 300);
    const sourceName = String(body.source_name || '').trim().slice(0, 120);
    const sourceUrl = safeHttpUrl(body.source_url);
    if (!TYPES.has(type)) return reply.code(400).send({ error: 'Invalid opportunity_type' });
    if (!title || !sourceName || !sourceUrl) return reply.code(400).send({ error: 'title, source_name and a valid HTTP(S) source_url are required' });

    const externalId = body.external_id == null ? null : String(body.external_id).slice(0, 240);
    const dedupeKey = sourceName.toLowerCase() + ':' + (externalId || sourceUrl);
    const companyId = body.company_id == null ? null : Number(body.company_id);
    if (companyId !== null && (!Number.isSafeInteger(companyId) || companyId <= 0)) return reply.code(400).send({ error: 'Invalid company_id' });
    const skills = Array.isArray(body.required_skills) ? body.required_skills.slice(0, 100) : [];
    const evidence = Array.isArray(body.evidence) ? body.evidence : [];
    const min = body.compensation_min == null ? null : Number(body.compensation_min);
    const max = body.compensation_max == null ? null : Number(body.compensation_max);
    if ((min !== null && (!Number.isFinite(min) || min < 0)) || (max !== null && (!Number.isFinite(max) || max < 0)) || (min !== null && max !== null && max < min)) {
      return reply.code(400).send({ error: 'Invalid compensation range' });
    }
    let deadline: string | null = null;
    let discoveredAt: string | null = null;
    try {
      if (body.deadline_at != null) deadline = new Date(String(body.deadline_at)).toISOString();
      if (body.discovered_at != null) discoveredAt = new Date(String(body.discovered_at)).toISOString();
    } catch { return reply.code(400).send({ error: 'Invalid date value' }); }

    const result = await pool.query(
      `INSERT INTO opportunity_records (
        opportunity_type, source_name, source_url, external_id, dedupe_key, title,
        description, organization_name, company_id, location, is_remote, employment_type,
        compensation_min, compensation_max, compensation_currency, compensation_period,
        deadline_at, required_skills, evidence, qualification, verification_status, discovered_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19::jsonb,$20::jsonb,$21,COALESCE($22::timestamptz,now()))
      ON CONFLICT (dedupe_key) DO NOTHING RETURNING *`,
      [
        type, sourceName, sourceUrl, externalId, dedupeKey, title,
        body.description == null ? null : String(body.description).slice(0, 12000),
        body.organization_name == null ? null : String(body.organization_name).slice(0, 240),
        companyId,
        body.location == null ? null : String(body.location).slice(0, 240),
        body.is_remote === true,
        body.employment_type == null ? null : String(body.employment_type).slice(0, 80),
        min, max,
        body.compensation_currency == null ? null : String(body.compensation_currency).slice(0, 12).toUpperCase(),
        body.compensation_period == null ? null : String(body.compensation_period).slice(0, 40),
        deadline, JSON.stringify(skills), JSON.stringify(evidence),
        JSON.stringify(body.qualification && typeof body.qualification === 'object' ? body.qualification : {}),
        VERIFICATION.has(String(body.verification_status)) ? String(body.verification_status) : 'unverified',
        discoveredAt
      ]
    );
    if (result.rowCount === 0) {
      const existing = await pool.query('SELECT id FROM opportunity_records WHERE dedupe_key = $1', [dedupeKey]);
      return reply.code(409).send({ error: 'Opportunity already exists', opportunity_id: existing.rows[0]?.id });
    }
    const opportunity = result.rows[0];
    await logActivity({ actor: 'opportunity_discovery', action: 'opportunity_record_created', entityType: 'opportunity_record', entityId: Number(opportunity.id), detail: { opportunity_type: type, source_name: sourceName } });
    return reply.code(201).send({ opportunity });
  });

  app.patch('/api/opportunity-records/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid opportunity id' });
    const body = (req.body || {}) as Record<string, unknown>;
    const status = body.status == null ? null : String(body.status);
    const verification = body.verification_status == null ? null : String(body.verification_status);
    if (status !== null && !STATUSES.has(status)) return reply.code(400).send({ error: 'Invalid status' });
    if (verification !== null && !VERIFICATION.has(verification)) return reply.code(400).send({ error: 'Invalid verification_status' });
    if (status === null && verification === null && body.fit_score == null) return reply.code(400).send({ error: 'Provide status, verification_status or fit_score' });
    const fitScore = body.fit_score == null ? null : Number(body.fit_score);
    if (fitScore !== null && (!Number.isFinite(fitScore) || fitScore < 0 || fitScore > 100)) return reply.code(400).send({ error: 'fit_score must be between 0 and 100' });
    const result = await pool.query(
      `UPDATE opportunity_records SET status = COALESCE($2,status), verification_status = COALESCE($3,verification_status), fit_score = COALESCE($4,fit_score), updated_at = now(), applied_at = CASE WHEN $2 = 'applied' THEN COALESCE(applied_at,now()) ELSE applied_at END WHERE id = $1 RETURNING *`,
      [id, status, verification, fitScore]
    );
    if (result.rowCount === 0) return reply.code(404).send({ error: 'Opportunity not found' });
    await logActivity({ actor: 'dashboard', action: 'opportunity_record_updated', entityType: 'opportunity_record', entityId: id, detail: { status, verification_status: verification, fit_score: fitScore } });
    return reply.send({ opportunity: result.rows[0] });
  });
}
