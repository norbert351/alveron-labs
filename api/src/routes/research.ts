import type { FastifyInstance } from 'fastify';
import { pool } from '../db.ts';
import { logActivity } from '../db.ts';
import {
  createResearchRun,
  runResearchRun,
  getResearchRun,
  listResearchRuns,
  getRunResults,
  getCompanyResearch,
  runDiscoveryStage,
  crawlAndSignalCompany,
  analyzeCompany,
} from '../research/engine.ts';
import { aiStatus } from '../ai/groq.ts';
import { listProviders } from '../discovery/index.ts';
import { industryKeys } from '../discovery/industryTaxonomy.ts';
import { GLOBAL_SAMPLE_METROS } from '../discovery/overpass.ts';

/**
 * Research engine API (spec sections 20, 25, 33, 34).
 * Dashboard routes require the internal Bearer token; /api/webhook/research/*
 * requires the X-Webhook-Key and is what the n8n workflows call.
 */

const running = new Set<string>();

function startRunInBackground(runId: string, force = false) {
  if (running.has(runId)) return false;
  running.add(runId);
  void runResearchRun(runId, { force })
    .catch((err) => console.error(`[research] run ${runId} failed:`, err?.message || err))
    .finally(() => running.delete(runId));
  return true;
}

export function registerResearchRoutes(app: FastifyInstance) {
  // ---- metadata: AI status, providers, industries (spec sections 30, 39) ----
  app.get('/api/research/meta', async () => {
    const services = await pool.query(`SELECT code, name, description, keywords, categories FROM service_catalog WHERE active = true ORDER BY name`);
    return {
      ai: aiStatus(),
      discovery_providers: listProviders(),
      industries: industryKeys(),
      global_sample_metros: GLOBAL_SAMPLE_METROS,
      service_catalog: services.rows,
    };
  });

  app.get('/api/research/services', async () => {
    const res = await pool.query(`SELECT code, name, description, keywords, categories FROM service_catalog WHERE active = true ORDER BY name`);
    return { services: res.rows };
  });

  // ---- create + list + read runs ----
  app.post('/api/research/runs', async (req, reply) => {
    const body: any = req.body || {};
    const run = await createResearchRun(body);
    await logActivity({ actor: 'dashboard', action: 'research_run_created', entityType: 'research_run', detail: { run_id: run.run_id } });
    startRunInBackground(run.run_id, body.force === true);
    reply.code(201).send({ run });
  });

  app.get('/api/research/runs', async (req) => {
    const { limit } = req.query as any;
    const runs = await listResearchRuns(Number(limit) || 50);
    return { runs };
  });

  app.get('/api/research/runs/:runId', async (req, reply) => {
    const { runId } = req.params as any;
    const run = await getResearchRun(runId);
    if (!run) return reply.code(404).send({ error: 'Research run not found' });
    const results = await getRunResults(runId);
    const errors = await pool.query(`SELECT * FROM engine_errors WHERE run_id = $1 ORDER BY created_at DESC LIMIT 50`, [runId]);
    const aiRuns = await pool.query(`SELECT purpose, status, count(*)::int AS n, COALESCE(sum(total_tokens),0)::int AS tokens, COALESCE(avg(latency_ms),0)::int AS avg_latency FROM ai_runs WHERE run_id = $1 GROUP BY purpose, status`, [runId]);
    return { run, results, errors: errors.rows, ai_runs: aiRuns.rows, is_running: running.has(runId) };
  });

  app.get('/api/research/runs/:runId/results', async (req) => {
    const { runId } = req.params as any;
    return { results: await getRunResults(runId) };
  });

  app.post('/api/research/runs/:runId/rerun', async (req, reply) => {
    const { runId } = req.params as any;
    const run = await getResearchRun(runId);
    if (!run) return reply.code(404).send({ error: 'Research run not found' });
    const started = startRunInBackground(runId, true);
    reply.code(started ? 202 : 409).send({ run_id: runId, started });
  });

  // ---- company research detail (spec section 34) ----
  app.get('/api/research/companies/:companyId', async (req, reply) => {
    const companyId = Number((req.params as any).companyId);
    const { run_id } = req.query as any;
    const data = await getCompanyResearch(companyId, run_id || undefined);
    if (!data.company) return reply.code(404).send({ error: 'Company not found' });
    return data;
  });

  app.post('/api/research/companies/:companyId/reanalyze', async (req, reply) => {
    const companyId = Number((req.params as any).companyId);
    const body: any = req.body || {};
    const runId = body.run_id;
    if (!runId) return reply.code(400).send({ error: 'run_id is required' });
    const res = await analyzeCompany(runId, companyId, { aiEnabled: aiStatus().configured });
    reply.send(res);
  });

  // =========================================================================
  // n8n webhook endpoints (X-Webhook-Key) — WF1..WF8
  // =========================================================================

  // WF8 coordinator / full pipeline
  app.post('/api/webhook/research/run', async (req, reply) => {
    const body: any = req.body || {};
    const run = await createResearchRun(body);
    if (body.wait === true) {
      await runResearchRun(run.run_id, { force: body.force === true });
      return { run_id: run.run_id, started: true, completed: true };
    }
    const started = startRunInBackground(run.run_id, body.force === true);
    reply.code(201).send({ run_id: run.run_id, started, status: 'running' });
  });

  // WF1/WF2: discovery + enrichment for an existing run
  app.post('/api/webhook/research/discover', async (req, reply) => {
    const body: any = req.body || {};
    let runId = body.run_id;
    if (!runId) {
      const run = await createResearchRun(body);
      runId = run.run_id;
    }
    const res = await runDiscoveryStage(runId);
    return { run_id: runId, ...res };
  });

  // WF3/WF4: crawl + signals for one company
  app.post('/api/webhook/research/company/crawl', async (req, reply) => {
    const body: any = req.body || {};
    const runId = String(body.run_id || '');
    const companyId = Number(body.company_id);
    if (!runId || !companyId) return reply.code(400).send({ error: 'run_id and company_id are required' });
    const res = await crawlAndSignalCompany(runId, companyId);
    return res;
  });

  // WF5/WF6/WF7: AI problems + opportunities + scoring + recommendations for one company
  app.post('/api/webhook/research/company/analyze', async (req, reply) => {
    const body: any = req.body || {};
    const runId = String(body.run_id || '');
    const companyId = Number(body.company_id);
    if (!runId || !companyId) return reply.code(400).send({ error: 'run_id and company_id are required' });
    const res = await analyzeCompany(runId, companyId, { aiEnabled: aiStatus().configured });
    return res;
  });

  // status polling (used by coordinator + monitoring workflows)
  app.get('/api/webhook/research/status/:runId', async (req, reply) => {
    const { runId } = req.params as any;
    const run = await getResearchRun(runId);
    if (!run) return reply.code(404).send({ error: 'Research run not found' });
    return { run, is_running: running.has(runId) };
  });

  app.get('/api/webhook/research/companies/:runId', async (req) => {
    const { runId } = req.params as any;
    return { results: await getRunResults(runId) };
  });
}
