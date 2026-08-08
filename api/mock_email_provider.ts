import Fastify from 'fastify';

/**
 * Mock transactional email provider for local testing.
 * Accepts POST /send, logs the message, returns a fake provider message id.
 * Point EMAIL_PROVIDER_URL at this when testing the n8n Email Send workflow
 * without real SMTP credentials.
 */
const app = Fastify({ logger: false });

app.post('/send', async (req, reply) => {
  const body: any = req.body || {};
  console.log('[mock-email] to=%s subject=%s chars=%d', body.to, body.subject, (body.html || '').length);
  reply.send({ id: `mock_${Date.now()}`, status: 'queued' });
});

app.post('/deliver', async (req, reply) => {
  const body: any = req.body || {};
  console.log('[mock-email] delivered id=%s', body.id || body.provider_message_id);
  reply.send({ ok: true });
});

const port = Number(process.env.MOCK_EMAIL_PORT || 3199);
app.listen({ port, host: '0.0.0.0' }).then(() => {
  console.log(`[mock-email] listening on :${port}`);
});
