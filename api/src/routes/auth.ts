import type { FastifyInstance } from 'fastify';
import { pool, logActivity } from '../db.ts';
import {
  authenticateUser,
  can,
  createSession,
  createUser,
  destroySession,
  listUsers,
  setUserRole,
  userCount,
  userForToken,
  type AuthedUser,
  type Role,
} from '../auth.ts';

function loadUser(req: any): AuthedUser | null {
  return (req.user as AuthedUser | undefined) || null;
}

export function registerAuthRoutes(app: FastifyInstance) {
  // First-run bootstrap: creates the owner when no users exist
  app.post('/api/auth/setup', async (req, reply) => {
    const { name, email, password } = req.body as any;
    if (!name || !email || !password) return reply.code(400).send({ error: 'name, email and password are required' });
    if (password.length < 10) return reply.code(400).send({ error: 'Password must be at least 10 characters' });
    if ((await userCount()) > 0) return reply.code(409).send({ error: 'Setup already completed' });
    const user = await createUser(String(name), String(email), String(password), 'owner');
    const token = await createSession(user.id);
    reply.send({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const { email, password } = req.body as any;
    if (!email || !password) return reply.code(400).send({ error: 'email and password are required' });
    const user = await authenticateUser(String(email), String(password));
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' });
    const token = await createSession(user.id);
    await logActivity({ actor: user.email, action: 'user_login', entityType: 'user', entityId: user.id });
    reply.send({ token, user });
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = (req.headers['x-user-token'] as string) || '';
    if (token) await destroySession(token);
    reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (req, reply) => {
    const user = loadUser(req);
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });
    reply.send({ user });
  });

  // ---- User management (owner only) ----
  app.get('/api/users', async (req, reply) => {
    const user = loadUser(req);
    if (!user || !can(user.role, 'users:manage')) return reply.code(403).send({ error: 'Owner only' });
    reply.send({ users: await listUsers() });
  });

  app.post('/api/users', async (req, reply) => {
    const user = loadUser(req);
    if (!user || !can(user.role, 'users:manage')) return reply.code(403).send({ error: 'Owner only' });
    const { name, email, password, role } = req.body as any;
    if (!name || !email || !password) return reply.code(400).send({ error: 'name, email and password are required' });
    const created = await createUser(String(name), String(email), String(password), (role as Role) || 'member');
    reply.code(201).send({ user: created });
  });

  app.patch('/api/users/:id/role', async (req, reply) => {
    const user = loadUser(req);
    if (!user || !can(user.role, 'users:manage')) return reply.code(403).send({ error: 'Owner only' });
    const { role } = req.body as any;
    if (!['owner', 'admin', 'member'].includes(role)) return reply.code(400).send({ error: 'Invalid role' });
    await setUserRole(Number((req.params as any).id), role as Role);
    reply.send({ ok: true });
  });

  // ---- Email safety: global pause ----
  app.get('/api/email-safety', async (req, reply) => {
    const user = loadUser(req);
    if (!user) return reply.code(401).send({ error: 'Not authenticated' });
    const res = await pool.query(`SELECT value FROM settings WHERE key = 'email_safety'`);
    const value = res.rowCount ? res.rows[0].value : {};
    reply.send({ safety: value });
  });

  app.put('/api/email-safety', async (req, reply) => {
    const user = loadUser(req);
    if (!user || !can(user.role, 'settings:manage')) return reply.code(403).send({ error: 'Not authorized' });
    const body: any = req.body || {};
    const current: any = await (async () => {
      const res = await pool.query(`SELECT value FROM settings WHERE key = 'email_safety'`);
      return res.rowCount ? res.rows[0].value : {};
    })();
    const next = {
      pause_all: body.pause_all !== undefined ? Boolean(body.pause_all) : Boolean(current.pause_all),
      daily_limit: Number(body.daily_limit ?? current.daily_limit ?? 20),
      min_delay_minutes: Number(body.min_delay_minutes ?? current.min_delay_minutes ?? 5),
      max_follow_ups: Number(body.max_follow_ups ?? current.max_follow_ups ?? 2),
    };
    await pool.query(
      `INSERT INTO settings (key, value) VALUES ('email_safety', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [JSON.stringify(next)]
    );
    await logActivity({
      actor: user.email,
      action: next.pause_all ? 'outreach_paused' : 'outreach_resumed',
      entityType: 'system',
      detail: { pause_all: next.pause_all },
    });
    reply.send({ safety: next });
  });
}
