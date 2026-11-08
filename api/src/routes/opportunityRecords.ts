import type { FastifyInstance } from 'fastify';
import { pool, logActivity } from '../db.ts';
import { listOpportunitySourceRuns, runOpportunityDiscovery } from '../opportunities/discovery.ts';

const TYPES = new Set(['remote_job', 'paid_task', 'agency_contract', 'business_lead', 'paid_research', 'technical_content']);
const STATUSES = new Set(['discovered', 'reviewing', 'qualified', 'approved', 'rejected', 'applied', 'closed', 'expired']);
const VERIFICATION = new Set(['unverified', 'partial', 'verified']);
const OUTCOME_TYPES = new Set(['reviewed', 'approved', 'rejected', 'applied', 'response_received', 'interview', 'offer', 'won', 'lost', 'no_response', 'follow_up', 'closed']);

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch { return null; }
}

let discoveryInProgress = false;

export function registerUnifiedOpportunityRoutes(app: FastifyInstance) {
  app.get('/api/opportunity-discovery/runs', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const runs = await listOpportunitySourceRuns(Number(query.limit) || 20);
    return reply.send({ runs });
  });

  const startDiscovery = async (reply: any) => {
    if (discoveryInProgress) return reply.code(409).send({ error: 'Opportunity discovery is already running' });
    discoveryInProgress = true;
    try {
      const result = await runOpportunityDiscovery();
      await logActivity({
        actor: 'opportunity_discovery',
        action: 'opportunity_discovery_completed',
        entityType: 'opportunity_source_run',
        detail: result.totals,
      });
      return reply.send(result);
    } finally {
      discoveryInProgress = false;
    }
  };

  app.post('/api/opportunity-discovery/run', async (_req, reply) => startDiscovery(reply));
  app.post('/api/webhook/opportunity-discovery', async (_req, reply) => startDiscovery(reply));

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
      'SELECT o.*, c.name AS company_name, c.website AS company_website, latest.event_type AS latest_outcome_type, latest.event_at AS latest_outcome_at FROM opportunity_records o LEFT JOIN companies c ON c.id = o.company_id LEFT JOIN LATERAL (SELECT event_type, event_at FROM opportunity_outcomes oo WHERE oo.opportunity_id = o.id ORDER BY event_at DESC LIMIT 1) latest ON true ' +
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

  app.get('/api/opportunity-profile', async (_req, reply) => {
    const result = await pool.query(
      `SELECT profile_key, display_name, skills, experience, preferences, constraints, active, updated_at
       FROM opportunity_profiles WHERE profile_key = 'primary' LIMIT 1`
    );
    return reply.send({
      profile: result.rows[0] || {
        profile_key: 'primary', display_name: 'Primary profile',
        skills: [], experience: {}, preferences: {}, constraints: {}, active: true,
      },
    });
  });

  app.put('/api/opportunity-profile', async (req, reply) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const isObject = (value: unknown): value is Record<string, unknown> =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const skills = Array.isArray(body.skills)
      ? body.skills.filter((skill): skill is string => typeof skill === 'string').map((skill) => skill.trim()).filter(Boolean).slice(0, 100)
      : [];
    if (body.skills != null && !Array.isArray(body.skills)) {
      return reply.code(400).send({ error: 'skills must be an array of strings' });
    }
    if (body.experience != null && !isObject(body.experience)) return reply.code(400).send({ error: 'experience must be an object' });
    if (body.preferences != null && !isObject(body.preferences)) return reply.code(400).send({ error: 'preferences must be an object' });
    if (body.constraints != null && !isObject(body.constraints)) return reply.code(400).send({ error: 'constraints must be an object' });
    const displayName = String(body.display_name || 'Primary profile').trim().slice(0, 120) || 'Primary profile';
    const result = await pool.query(
      `INSERT INTO opportunity_profiles (profile_key, display_name, skills, experience, preferences, constraints, active)
       VALUES ('primary', $1, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb, true)
       ON CONFLICT (profile_key) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         skills = EXCLUDED.skills,
         experience = EXCLUDED.experience,
         preferences = EXCLUDED.preferences,
         constraints = EXCLUDED.constraints,
         active = true,
         updated_at = now()
       RETURNING profile_key, display_name, skills, experience, preferences, constraints, active, updated_at`,
      [
        displayName, JSON.stringify(skills),
        JSON.stringify(isObject(body.experience) ? body.experience : {}),
        JSON.stringify(isObject(body.preferences) ? body.preferences : {}),
        JSON.stringify(isObject(body.constraints) ? body.constraints : {}),
      ]
    );
    await logActivity({ actor: 'dashboard', action: 'opportunity_profile_updated', entityType: 'opportunity_profile', detail: { skill_count: skills.length } });
    return reply.send({ profile: result.rows[0] });
  });

  app.post('/api/opportunity-records/:id/score', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid opportunity id' });
    const [profileResult, opportunityResult] = await Promise.all([
      pool.query(`SELECT skills, experience, preferences, constraints FROM opportunity_profiles WHERE profile_key = 'primary' AND active = true LIMIT 1`),
      pool.query('SELECT id, opportunity_type, is_remote, required_skills, location, compensation_min, compensation_max, compensation_currency FROM opportunity_records WHERE id = $1', [id]),
    ]);
    if (opportunityResult.rowCount === 0) return reply.code(404).send({ error: 'Opportunity not found' });
    if (profileResult.rowCount === 0) return reply.code(409).send({ error: 'Set up your opportunity profile before matching' });

    const profile = profileResult.rows[0];
    const opportunity = opportunityResult.rows[0];
    const normalize = (value: unknown) => String(value).trim().toLowerCase();
    const profileSkills = new Set((Array.isArray(profile.skills) ? profile.skills : []).map(normalize));
    const requiredSkills = Array.isArray(opportunity.required_skills) ? opportunity.required_skills.map(normalize) : [];
    const matchedSkills = requiredSkills.filter((skill: string) => profileSkills.has(skill));
    const missingSkills = requiredSkills.filter((skill: string) => !profileSkills.has(skill));
    const preferences = profile.preferences && typeof profile.preferences === 'object' ? profile.preferences : {};
    const experience = profile.experience && typeof profile.experience === 'object' ? profile.experience : {};
    const constraints = profile.constraints && typeof profile.constraints === 'object' ? profile.constraints : {};
    const reasons: string[] = [];
    const hasRemotePreference = typeof preferences.remoteOnly === 'boolean';
    const hasTypePreference = Array.isArray(preferences.preferredTypes) && preferences.preferredTypes.length > 0;
    let score = requiredSkills.length ? Math.round((matchedSkills.length / requiredSkills.length) * 85) : (hasRemotePreference || hasTypePreference ? 50 : null);
    if (requiredSkills.length) reasons.push('Skill coverage: ' + matchedSkills.length + ' of ' + requiredSkills.length + ' required skills');
    if (!requiredSkills.length && score !== null) reasons.push('Baseline score from profile preferences. Add required skills for a stronger match estimate');
    if (preferences.remoteOnly === true) {
      if (opportunity.is_remote === true) {
        score = score === null ? 65 : Math.min(100, score + 10);
        reasons.push('Preference match: remote opportunity');
      } else {
        score = score === null ? 0 : Math.max(0, score - 15);
        reasons.push('Penalty: this opportunity is not marked remote');
      }
    }
    const preferredTypes = Array.isArray(preferences.preferredTypes) ? preferences.preferredTypes : [];
    if (preferredTypes.length > 0) {
      if (preferredTypes.includes(opportunity.opportunity_type)) {
        score = score === null ? 60 : Math.min(100, score + 10);
        reasons.push('Preference match: opportunity type is preferred');
      } else {
        score = score === null ? 0 : Math.max(0, score - 10);
        reasons.push('Penalty: opportunity type is outside preferred types');
      }
    }
    const blockedTypes = Array.isArray(constraints.blockedTypes) ? constraints.blockedTypes : [];
    if (blockedTypes.includes(opportunity.opportunity_type)) {
      score = 0;
      reasons.push('Constraint: this opportunity type is excluded by your profile');
    }
    const minimumCompensation = Number(constraints.minimumCompensation);
    const minimumCurrency = String(constraints.minimumCompensationCurrency || '').toUpperCase();
    const opportunityCurrency = String(opportunity.compensation_currency || '').toUpperCase();
    if (Number.isFinite(minimumCompensation) && minimumCompensation > 0 && minimumCurrency && minimumCurrency === opportunityCurrency) {
      const offeredMinimum = opportunity.compensation_min == null ? null : Number(opportunity.compensation_min);
      const offeredMaximum = opportunity.compensation_max == null ? null : Number(opportunity.compensation_max);
      if ((offeredMinimum !== null && offeredMinimum < minimumCompensation) || (offeredMinimum === null && offeredMaximum !== null && offeredMaximum < minimumCompensation)) {
        score = 0;
        reasons.push('Constraint: listed compensation range is below your minimum');
      }
    } else if (Number.isFinite(minimumCompensation) && minimumCompensation > 0 && opportunityCurrency && minimumCurrency && opportunityCurrency !== minimumCurrency) {
      reasons.push('Compensation threshold not compared because the listing currency differs from your minimum currency');
    }
    const candidateCountry = String(preferences.country || '').trim().toLowerCase();
    const opportunityLocation = String(opportunity.location || '').trim().toLowerCase();
    const locationIsBroad = /worldwide|anywhere|global|all locations|africa|emea|americas|europe|asia pacific/.test(opportunityLocation);
    if (candidateCountry && opportunityLocation && !locationIsBroad && !opportunityLocation.includes(candidateCountry)) {
      score = 0;
      reasons.push('Location may be restricted to ' + String(opportunity.location) + ', which does not explicitly include ' + String(preferences.country));
    }
    const allowedCurrencies = Array.isArray(constraints.allowedCurrencies) ? constraints.allowedCurrencies.map((currency: unknown) => String(currency).toUpperCase()) : [];
    if (allowedCurrencies.length > 0 && opportunity.compensation_currency && !allowedCurrencies.includes(String(opportunity.compensation_currency).toUpperCase())) {
      score = 0;
      reasons.push('Constraint: compensation currency is outside your allowed currencies');
    }
    if (score === null) {
      return reply.code(422).send({ error: 'No matchable criteria found. Add required skills or matching preferences to the opportunity profile.' });
    }
    score = Math.min(100, Math.max(0, score));
    const breakdown = { score, matched_skills: matchedSkills, missing_skills: missingSkills, required_skill_count: requiredSkills.length, reasons, experience_profile: experience, candidate_country: preferences.country || null, constraints };
    const updated = await pool.query(
      `UPDATE opportunity_records
       SET fit_score = $2, qualification = COALESCE(qualification, '{}'::jsonb) || jsonb_build_object('match', $3::jsonb), updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, score, JSON.stringify(breakdown)]
    );
    await logActivity({ actor: 'matching_engine', action: 'opportunity_scored', entityType: 'opportunity_record', entityId: id, detail: { fit_score: score } });
    return reply.send({ opportunity: updated.rows[0], match: breakdown });
  });

  app.get('/api/opportunity-records/:id/outcomes', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid opportunity id' });
    const exists = await pool.query('SELECT id FROM opportunity_records WHERE id = $1', [id]);
    if (exists.rowCount === 0) return reply.code(404).send({ error: 'Opportunity not found' });
    const result = await pool.query(
      'SELECT id, opportunity_id, event_type, notes, metadata, event_at, created_at FROM opportunity_outcomes WHERE opportunity_id = $1 ORDER BY event_at DESC, id DESC',
      [id]
    );
    return reply.send({ outcomes: result.rows });
  });

  app.post('/api/opportunity-records/:id/outcomes', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid opportunity id' });
    const body = (req.body || {}) as Record<string, unknown>;
    const eventType = String(body.event_type || '');
    if (!OUTCOME_TYPES.has(eventType)) return reply.code(400).send({ error: 'Invalid outcome event_type' });
    const notes = body.notes == null ? null : String(body.notes).trim().slice(0, 5000);
    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
    let eventAt: string | null = null;
    try {
      if (body.event_at != null) eventAt = new Date(String(body.event_at)).toISOString();
    } catch {
      return reply.code(400).send({ error: 'Invalid event_at date' });
    }

    const exists = await pool.query('SELECT id FROM opportunity_records WHERE id = $1', [id]);
    if (exists.rowCount === 0) return reply.code(404).send({ error: 'Opportunity not found' });
    const result = await pool.query(
      \`INSERT INTO opportunity_outcomes (opportunity_id, event_type, notes, metadata, event_at)
       VALUES ($1, $2, $3, $4::jsonb, COALESCE($5::timestamptz, now()))
       RETURNING id, opportunity_id, event_type, notes, metadata, event_at, created_at\`,
      [id, eventType, notes, JSON.stringify(metadata), eventAt]
    );

    const statusByEvent: Record<string, string> = {
      approved: 'approved',
      rejected: 'rejected',
      applied: 'applied',
      closed: 'closed',
    };
    const nextStatus = statusByEvent[eventType];
    if (nextStatus) {
      await pool.query(
        \`UPDATE opportunity_records SET status = $2,
         applied_at = CASE WHEN $2 = 'applied' THEN COALESCE(applied_at, $3::timestamptz, now()) ELSE applied_at END,
         updated_at = now() WHERE id = $1\`,
        [id, nextStatus, eventAt]
      );
    }
    await logActivity({
      actor: 'dashboard',
      action: 'opportunity_outcome_recorded',
      entityType: 'opportunity_record',
      entityId: id,
      detail: { event_type: eventType },
    });
    return reply.code(201).send({ outcome: result.rows[0] });
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
