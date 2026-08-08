import type { FastifyInstance } from 'fastify';
import { pool, logActivity } from '../db.ts';

/**
 * Lead sources: controlled ingestion.
 * Sources are configured entries (manual CSV, directory, search API later).
 * The /api/webhook/leads endpoint ingests batches from any authenticated source.
 * CSV import here parses real uploaded CSV into leads + companies.
 */
export function registerLeadSourceRoutes(app: FastifyInstance) {
  app.get('/api/lead-sources', async (_req, reply) => {
    const res = await pool.query(`SELECT * FROM lead_sources ORDER BY id`);
    reply.send({ sources: res.rows });
  });

  app.post('/api/lead-sources', async (req, reply) => {
    const body: any = req.body || {};
    if (!body.name) return reply.code(400).send({ error: 'name is required' });
    const res = await pool.query(
      `INSERT INTO lead_sources (name, kind, config, enabled) VALUES ($1, $2, $3, $4) RETURNING *`,
      [String(body.name), String(body.kind || 'manual'), JSON.stringify(body.config || {}), body.enabled !== false]
    );
    await logActivity({ actor: (req as any).user?.email || 'system', action: 'lead_source_created', entityType: 'lead_source', entityId: res.rows[0].id });
    reply.code(201).send({ source: res.rows[0] });
  });

  app.patch('/api/lead-sources/:id', async (req, reply) => {
    const id = Number((req.params as any).id);
    const body: any = req.body || {};
    const res = await pool.query(
      `UPDATE lead_sources SET
         name = COALESCE($2, name),
         config = CASE WHEN $3 IS NOT NULL THEN $3::jsonb ELSE config END,
         enabled = COALESCE($4, enabled),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, body.name != null ? String(body.name) : null, body.config != null ? JSON.stringify(body.config) : null, body.enabled != null ? Boolean(body.enabled) : null]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: 'Source not found' });
    reply.send({ source: res.rows[0] });
  });

  app.get('/api/leads', async (req, reply) => {
    const { status, source } = req.query as any;
    const conds: string[] = [];
    const params: any[] = [];
    if (status) { params.push(String(status)); conds.push(`status = $${params.length}`); }
    if (source) { params.push(String(source)); conds.push(`source = $${params.length}`); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const res = await pool.query(
      `SELECT id, source, source_key, company_id, name, website, industry, location, company_size, keywords, status, source_url, discovered_at, created_at
       FROM leads ${where} ORDER BY id DESC LIMIT 500`,
      params
    );
    reply.send({ leads: res.rows });
  });

  // Real CSV import: text/csv body with header row name,website,industry,location,company_size,keywords
  app.post('/api/leads/import-csv', async (req, reply) => {
    const raw: any = req.body;
    const sourceName = String((req.query as any).source || 'csv-import');
    if (typeof raw !== 'string' || !raw.trim()) return reply.code(400).send({ error: 'CSV body required (text/csv)' });

    const lines = raw.replace(/\r/g, '').split('\n').filter((l: string) => l.trim());
    if (lines.length < 2) return reply.code(400).send({ error: 'CSV must contain a header row and at least one data row' });

    const parseRow = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQ = false;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === ',' && !inQ) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };

    const header = parseRow(lines[0]).map((h) => h.toLowerCase());
    const col = (name: string) => header.indexOf(name);

    const iName = col('name') ?? col('company');
    const iWeb = col('website') ?? col('url') ?? col('domain');
    const iInd = col('industry');
    const iLoc = col('location');
    const iSize = col('company_size') ?? col('size');
    if (iName === -1 || iWeb === -1) {
      return reply.code(400).send({ error: 'CSV must have name and website columns' });
    }

    const created: any[] = [];
    const duplicates: any[] = [];
    const errors: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseRow(lines[i]);
      const name = cells[iName] || '';
      const website = cells[iWeb] || '';
      if (!name || !website) continue;
      try {
        const dupLead = await pool.query(`SELECT id FROM leads WHERE source = $1 AND source_key = $2`, [sourceName, website]);
        if ((dupLead.rowCount ?? 0) > 0) { duplicates.push({ name, website, reason: 'existing lead' }); continue; }
        const dupCompany = await pool.query(`SELECT id FROM companies WHERE lower(website) = lower($1)`, [`https://${website.replace(/^https?:\/\//, '')}`]);
        if ((dupCompany.rowCount ?? 0) > 0) { duplicates.push({ name, website, reason: 'existing company' }); continue; }
        const res = await pool.query(
          `INSERT INTO leads (source, source_key, name, website, industry, location, company_size, keywords, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'new') RETURNING id`,
          [
            sourceName,
            website,
            name,
            website,
            iInd >= 0 ? cells[iInd] || null : null,
            iLoc >= 0 ? cells[iLoc] || null : null,
            iSize >= 0 ? cells[iSize] || null : null,
            JSON.stringify([]),
          ]
        );
        created.push({ id: res.rows[0].id, name, website });
      } catch (err: any) {
        errors.push({ name, website, error: String(err?.message || err).slice(0, 150) });
      }
    }
    await logActivity({ actor: (req as any).user?.email || 'system', action: 'leads_imported_csv', entityType: 'lead_source', detail: { source: sourceName, created: created.length, duplicates: duplicates.length, errors: errors.length } });
    reply.send({ created: created.length, duplicates: duplicates.length, errors: errors.length, created_leads: created, duplicate_leads: duplicates.slice(0, 20), error_detail: errors.slice(0, 20) });
  });
}
