import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';

export function registerOverviewRoutes(app: FastifyInstance) {
  app.get('/api/overview', async (_req, reply) => {
    const [companies, scans, opps, proposals, outreach, recent, byService] = await Promise.all([
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
                         count(*) FILTER (WHERE status = 'open')::int AS open
                  FROM opportunities`),
      pool.query(`SELECT count(*)::int AS total,
                         count(*) FILTER (WHERE status = 'sent')::int AS sent,
                         count(*) FILTER (WHERE status = 'draft')::int AS draft
                  FROM proposals`),
      pool.query(`SELECT count(*)::int AS total,
                         count(*) FILTER (WHERE status = 'approved')::int AS approved,
                         count(*) FILTER (WHERE status = 'sent')::int AS sent,
                         count(*) FILTER (WHERE status = 'rejected')::int AS rejected
                  FROM outreach`),
      pool.query(
        `SELECT c.id, c.name, c.website, c.status, c.created_at,
                (SELECT count(*) FROM opportunities o WHERE o.company_id = c.id) AS opportunity_count
         FROM companies c ORDER BY c.created_at DESC LIMIT 6`
      ),
      pool.query(
        `SELECT matched_service, count(*)::int AS count
         FROM opportunities WHERE matched_service IS NOT NULL
         GROUP BY matched_service ORDER BY count DESC`
      ),
    ]);

    reply.send({
      companies: companies.rows[0],
      scans: scans.rows[0],
      opportunities: opps.rows[0],
      proposals: proposals.rows[0],
      outreach: outreach.rows[0],
      recentCompanies: recent.rows,
      byService: byService.rows,
    });
  });
}
