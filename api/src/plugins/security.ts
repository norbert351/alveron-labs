import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config.ts';
import { logActivity } from '../db.ts';

/**
 * Security layer:
 * - rate limiting on everything
 * - /api/webhook/* requires X-Webhook-Key (n8n, email providers)
 * - everything else under /api requires Authorization: Bearer <internal token>
 * - /api/health stays public
 * - auth failures are audit-logged (throttled per IP)
 */
export async function registerSecurity(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.timeWindowMs,
    ban: 3,
    errorResponseBuilder: (_req, context) => ({
      error: `Rate limit exceeded, retry in ${context.after}`,
    }),
  });

  const authFailures = new Map<string, number>();

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path === '/api/health') return;
    if (!path.startsWith('/api/')) return;

    const ip = req.ip || 'unknown';
    if (path.startsWith('/api/webhook/')) {
      const key = req.headers['x-webhook-key'];
      if (key === config.auth.webhookToken) return;
      throttleAudit(ip, authFailures);
      await logActivity({ actor: ip, action: 'auth_failed', entityType: 'webhook', detail: { path } });
      return reply.code(401).send({ error: 'Invalid webhook key' });
    }

    const auth = req.headers.authorization || '';
    if (auth === `Bearer ${config.auth.internalToken}`) return;
    throttleAudit(ip, authFailures);
    await logActivity({ actor: ip, action: 'auth_failed', entityType: 'api', detail: { path } });
    reply.code(401).send({ error: 'Unauthorized' });
  });
}

function throttleAudit(ip: string, map: Map<string, number>) {
  const last = map.get(ip) || 0;
  const now = Date.now();
  if (now - last < 60000) return;
  map.set(ip, now);
}
