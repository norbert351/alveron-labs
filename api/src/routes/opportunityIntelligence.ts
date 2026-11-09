import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';
import { assessOpportunityQuality, buildApplicationDraft, calculateOpportunityPriority, calculateOutcomeAdjustment } from '../opportunities/intelligence.ts';

export function registerOpportunityIntelligenceRoutes(app: FastifyInstance) {
  app.get('/api/opportunity-intelligence/summary', async (_req, reply) => {
    const [totals, byType, bySource, latestRun] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status IN ('discovered','reviewing','qualified'))::int AS active,
        count(*) FILTER (WHERE status = 'approved')::int AS approved,
        count(*) FILTER (WHERE status = 'applied')::int AS applied,
        count(*) FILTER (WHERE deadline_at IS NOT NULL AND deadline_at < now())::int AS past_deadline
        FROM opportunity_records`),
      pool.query('SELECT opportunity_type, count(*)::int AS count FROM opportunity_records GROUP BY opportunity_type ORDER BY count DESC'),
      pool.query('SELECT source_name, count(*)::int AS count, max(discovered_at) AS latest_discovery FROM opportunity_records GROUP BY source_name ORDER BY count DESC LIMIT 20'),
      pool.query('SELECT id, status, discovered_count, new_count, duplicate_count, completed_at FROM opportunity_source_runs ORDER BY created_at DESC LIMIT 1'),
    ]);
    return reply.send({ summary: totals.rows[0], by_type: byType.rows, by_source: bySource.rows, latest_discovery_run: latestRun.rows[0] || null });
  });

  app.get('/api/opportunity-intelligence/briefing', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const limit = Math.min(30, Math.max(1, Number(query.limit) || 10));
    const result = await pool.query(
      `SELECT * FROM opportunity_records
       WHERE status NOT IN ('rejected','closed','expired')
         AND (deadline_at IS NULL OR deadline_at >= now())
       ORDER BY fit_score DESC NULLS LAST, discovered_at DESC
       LIMIT $1`,
      [limit]
    );
    const outcomes = await pool.query(
      `SELECT o.opportunity_type, oo.event_type FROM opportunity_outcomes oo JOIN opportunity_records o ON o.id = oo.opportunity_id WHERE oo.event_type IN ('response_received','interview','offer','won','rejected','no_response','lost')`
    );
    const eventsByType = new Map<string, string[]>();
    for (const outcome of outcomes.rows) {
      const events = eventsByType.get(outcome.opportunity_type) || [];
      events.push(outcome.event_type);
      eventsByType.set(outcome.opportunity_type, events);
    }
    const opportunities = result.rows.map((row) => {
      const quality = assessOpportunityQuality(row);
      return {
        id: Number(row.id),
        title: row.title,
        organization_name: row.organization_name,
        opportunity_type: row.opportunity_type,
        source_name: row.source_name,
        source_url: row.source_url,
        compensation_min: row.compensation_min,
        compensation_max: row.compensation_max,
        compensation_currency: row.compensation_currency,
        deadline_at: row.deadline_at,
        fit_score: row.fit_score == null ? null : Number(row.fit_score),
        quality,
        outcome_feedback: calculateOutcomeAdjustment(eventsByType.get(row.opportunity_type) || []),
        priority_score: calculateOpportunityPriority({
          fitScore: row.fit_score == null ? null : Number(row.fit_score),
          qualityScore: quality.score,
          deadlineAt: row.deadline_at,
          discoveredAt: row.discovered_at,
          outcomeAdjustment: calculateOutcomeAdjustment(eventsByType.get(row.opportunity_type) || []).adjustment,
        }),
      };
    }).sort((a, b) => b.priority_score - a.priority_score);
    return reply.send({ generated_at: new Date().toISOString(), count: opportunities.length, opportunities });
  });

  app.get('/api/opportunity-intelligence/learning', async (_req, reply) => {
    const result = await pool.query(
      `SELECT o.opportunity_type, oo.event_type, count(*)::int AS count FROM opportunity_outcomes oo JOIN opportunity_records o ON o.id = oo.opportunity_id GROUP BY o.opportunity_type, oo.event_type ORDER BY o.opportunity_type, oo.event_type`
    );
    const grouped = new Map<string, string[]>();
    for (const row of result.rows) {
      const events = grouped.get(row.opportunity_type) || [];
      for (let index = 0; index < row.count; index++) events.push(row.event_type);
      grouped.set(row.opportunity_type, events);
    }
    const byType = Array.from(grouped.entries()).map(([opportunity_type, events]) => ({ opportunity_type, ...calculateOutcomeAdjustment(events) }));
    return reply.send({ by_type: byType, note: 'Outcome feedback is a small ranking adjustment, not a predictive hiring model. Types with fewer than three recorded outcomes are not adjusted.' });
  });

  app.post('/api/opportunity-records/:id/assess', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid opportunity id' });
    const result = await pool.query('SELECT * FROM opportunity_records WHERE id = $1', [id]);
    if (!result.rowCount) return reply.code(404).send({ error: 'Opportunity not found' });
    const quality = assessOpportunityQuality(result.rows[0]);
    await pool.query(
      `UPDATE opportunity_records
       SET qualification = COALESCE(qualification, '{}'::jsonb) || jsonb_build_object('quality_assessment', $2::jsonb),
           updated_at = now()
       WHERE id = $1`,
      [id, JSON.stringify(quality)]
    );
    return reply.send({ opportunity_id: id, quality, verification_status: result.rows[0].verification_status, note: 'This assessment checks stored metadata and evidence only. It does not confirm that the source listing is currently open or independently verify the organization.' });
  });

  app.post('/api/opportunity-records/:id/application-draft', async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Invalid opportunity id' });
    const [opportunity, profile] = await Promise.all([
      pool.query('SELECT * FROM opportunity_records WHERE id = $1', [id]),
      pool.query('SELECT display_name, skills, experience FROM opportunity_profiles WHERE profile_key = $1 AND active = true LIMIT 1', ['primary']),
    ]);
    if (!opportunity.rowCount) return reply.code(404).send({ error: 'Opportunity not found' });
    if (!profile.rowCount) return reply.code(422).send({ error: 'Create an active opportunity profile before generating an application draft.' });
    const draft = buildApplicationDraft(opportunity.rows[0], profile.rows[0]);
    return reply.send({ opportunity_id: id, draft });
  });
}
