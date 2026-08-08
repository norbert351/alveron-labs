import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../db.ts';
import { clearLlmCache } from '../llm/client.ts';

export function registerSettingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async (_req, reply) => {
    const llm = await getSetting('llm');
    const services = await getSetting('services');
    reply.send({
      llm: llm
        ? {
            baseUrl: llm.baseUrl || '',
            model: llm.model || '',
            keySet: Boolean(llm.apiKey),
          }
        : { baseUrl: '', model: '', keySet: false },
      services: Array.isArray(services) ? services : [],
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
}
