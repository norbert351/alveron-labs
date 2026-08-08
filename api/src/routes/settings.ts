import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../db.ts';
import { clearLlmCache } from '../llm/client.ts';

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async (_req, reply) => {
    const [llm, services, followUp, email, workflowRuns] = await Promise.all([
      getSetting('llm'),
      getSetting('services'),
      getSetting('follow_up'),
      getSetting('email'),
      getSetting('workflow_runs'),
    ]);
    reply.send({
      llm: llm
        ? { baseUrl: llm.baseUrl || '', model: llm.model || '', keySet: Boolean(llm.apiKey) }
        : { baseUrl: '', model: '', keySet: false },
      services: Array.isArray(services) ? services : [],
      followUp: followUp || { enabled: true, days: [0, 4, 9], max_follow_ups: 2 },
      email: email || { provider: '', from_name: 'Alveron Labs', from_email: '' },
      workflowRuns: workflowRuns || { workflow_names: [] },
    });
  });

  app.put('/api/settings/llm', async (req, reply) => {
    const body: any = req.body || {};
    const current = (await getSetting('llm')) || {};
    const next = {
      baseUrl: body.baseUrl != null ? String(body.baseUrl).trim() : current.baseUrl,
      apiKey: body.apiKey != null && String(body.apiKey).trim() ? String(body.apiKey).trim() : current.apiKey,
      model: body.model != null ? String(body.model).trim() : current.model,
    };
    if (!next.baseUrl || !next.apiKey) {
      return reply.code(400).send({ error: 'Base URL and API key are required' });
    }
    await setSetting('llm', next);
    clearLlmCache();
    reply.send({ llm: { baseUrl: next.baseUrl, model: next.model, keySet: Boolean(next.apiKey) } });
  });

  app.put('/api/settings/services', async (req, reply) => {
    const body: any = req.body || {};
    if (!Array.isArray(body.services) || body.services.length === 0) {
      return reply.code(400).send({ error: 'services must be a non-empty array' });
    }
    const services = body.services
      .filter((s: any) => s && typeof s.name === 'string' && s.name.trim())
      .map((s: any) => ({ name: s.name.trim(), description: String(s.description || '').trim() }));
    await setSetting('services', services);
    reply.send({ services });
  });

  app.put('/api/settings/follow-up', async (req, reply) => {
    const body: any = req.body || {};
    const days = Array.isArray(body.days)
      ? body.days.map(Number).filter((d: number) => Number.isFinite(d) && d >= 0).sort((a: number, b: number) => a - b)
      : [0, 4, 9];
    if (days.length === 0) return reply.code(400).send({ error: 'days must contain at least one non-negative number' });
    const next = {
      enabled: body.enabled !== false,
      days,
      max_follow_ups: Number.isFinite(Number(body.max_follow_ups)) ? Number(body.max_follow_ups) : Math.max(0, days.length - 1),
    };
    await setSetting('follow_up', next);
    reply.send({ followUp: next });
  });

  app.put('/api/settings/email', async (req, reply) => {
    const body: any = req.body || {};
    const next = {
      provider: String(body.provider || '').trim(),
      from_name: String(body.from_name || 'Alveron Labs').trim(),
      from_email: String(body.from_email || '').trim(),
    };
    await setSetting('email', next);
    reply.send({ email: next });
  });

  app.put('/api/settings/workflow-runs', async (req, reply) => {
    const body: any = req.body || {};
    if (!Array.isArray(body.workflow_names)) {
      return reply.code(400).send({ error: 'workflow_names must be an array' });
    }
    const next = { workflow_names: body.workflow_names.map(String).filter(Boolean) };
    await setSetting('workflow_runs', next);
    reply.send({ workflowRuns: next });
  });
}
