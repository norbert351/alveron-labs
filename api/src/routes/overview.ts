import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';

export function registerOverviewRoutes(app: FastifyInstance) {
  app.get('/api/overview', async (_req, reply) => {
    const [companies, scans, opps, proposals, outreach, recent, byService, byPriority, stages] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total,
                         count(*) FILTER (WHERE status = 'new')::int AS new,
                         count(*) FILTER (WHERE status = 'analyzed')::int AS analyzed,
                         count(*) FILTER (WHERE status = 'proposed')::int AS proposed,
                         count(*) FILTER (WHERE status = 'outreach')::int AS outreach
                  FROM companies`),
      pool.query(`SELECT count(*)::int AS total,
                         count(*) FILTER (WHERE status = 'completed')::int AS completed,
                         count(*) FILTER (WHERE status = 'failed')::int AS failed
                  FROM website_scans`),
      pool.query(`SELECT count(*)::int AS total,
                         round(avg(confidence)::numeric, 2) AS avg_confidence,
                         count(*) FILTER (WHERE status = 'open')::int AS open,
                         count(*) FILTER (WHERE priority = 'High')::int AS high,
                         count(*) FILTER (WHERE priority = 'Medium')::int AS medium,
                         count(*) FILTER (WHERE priority = 'Low')::int AS low
                  FROM opportunities`),
      pool.query(`SELECT count(*)::int AS total,
                         count(*) FILTER (WHERE status = 'sent')::int AS sent,
                         count(*) FILTER (WHERE status = 'draft')::int AS draft,
                         count(*) FILTER (WHERE status = 'approved')::int AS approved
                  FROM proposals`),
      pool.query(`SELECT count(*)::int AS total,
                         count(*) FILTER (WHERE status = 'approved')::int AS approved,
                         count(*) FILTER (WHERE status = 'sent')::int AS sent,
                         count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
                         count(*) FILTER (WHERE status = 'failed')::int AS failed,
                         count(*) FILTER (WHERE status = 'bounced')::int AS bounced
                  FROM outreach`),
      pool.query(
        `SELECT c.id, c.name, c.website, c.status, c.stage, c.created_at,
                (SELECT count(*) FROM opportunities o WHERE o.company_id = c.id) AS opportunity_count
         FROM companies c ORDER BY c.created_at DESC LIMIT 6`
      ),
      pool.query(
        `SELECT matched_service, count(*)::int AS count
         FROM opportunities WHERE matched_service IS NOT NULL
         GROUP BY matched_service ORDER BY count DESC`
      ),
      pool.query(
        `SELECT priority, count(*)::int AS count
         FROM opportunities WHERE priority IS NOT NULL
         GROUP BY priority ORDER BY count DESC`
      ),
      pool.query(
        `SELECT stage, count(*)::int AS count FROM companies GROUP BY stage ORDER BY count DESC`
      ),
    ]);

    const c = companies.rows[0];
    const o = opps.rows[0];
    const p = proposals.rows[0];
    const ot = outreach.rows[0];

    // Conversion rates, only where a denominator exists (never fabricated)
    const rates: Record<string, number | null> = {
      researched_to_company: c.total > 0 ? round2(c.analyzed / c.total) : null,
      proposed_to_researched: c.analyzed > 0 ? round2(c.proposed / c.analyzed) : null,
      approved_to_proposals: p.total > 0 ? round2(ot.approved / p.total) : null,
      sent_to_approved: ot.approved > 0 ? round2(ot.sent / ot.approved) : null,
      rejected_to_total: ot.total > 0 ? round2(ot.rejected / ot.total) : null,
    };

    reply.send({
      companies: c,
      scans: scans.rows[0],
      opportunities: o,
      proposals: p,
      outreach: ot,
      recentCompanies: recent.rows,
      byService: byService.rows,
      byPriority: byPriority.rows,
      stages: stages.rows,
      conversionRates: rates,
    });
  });
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
