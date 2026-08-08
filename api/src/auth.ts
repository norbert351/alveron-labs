import { randomBytes, scrypt as scryptCb, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.ts';
import { config } from './config.ts';

const scrypt = promisify(scryptCb) as (p: string, s: string, n: number) => Promise<Buffer>;

export type Role = 'owner' | 'admin' | 'member';

export const PERMISSIONS = {
  'leads:manage': ['owner', 'admin'],
  'outreach:view': ['owner', 'admin', 'member'],
  'outreach:approve': ['owner', 'admin'],
  'email:manage': ['owner', 'admin'],
  'email:send': ['owner', 'admin'],
  'settings:manage': ['owner', 'admin'],
  'catalog:manage': ['owner', 'admin'],
  'users:manage': ['owner'],
} as const;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[perm] as readonly string[]).includes(role);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = (await scrypt(password, salt, 64)).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, salt, hash] = stored.split(':');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const candidate = (await scrypt(password, salt, 64)).toString('hex');
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && a.equals(b);
}

export interface AuthedUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createUser(name: string, email: string, password: string, role: Role = 'member') {
  const pwHash = await hashPassword(password);
  const res = await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role`,
    [name, email.toLowerCase().trim(), pwHash, role]
  );
  return res.rows[0];
}

export async function userCount(): Promise<number> {
  const res = await pool.query(`SELECT count(*)::int AS n FROM users`);
  return res.rows[0].n;
}

export async function authenticateUser(email: string, password: string): Promise<AuthedUser | null> {
  const res = await pool.query(`SELECT id, name, email, role, password_hash FROM users WHERE lower(email) = $1`, [
    email.toLowerCase().trim(),
  ]);
  if (res.rowCount === 0) return null;
  const u = res.rows[0];
  const ok = await verifyPassword(password, u.password_hash);
  if (!ok) return null;
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

export async function createSession(userId: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [userId, hashToken(token), config.auth.sessionTtlHours]
  );
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await pool.query(`DELETE FROM sessions WHERE token_hash = $1`, [hashToken(token)]);
}

export async function userForToken(token: string | undefined): Promise<AuthedUser | null> {
  if (!token) return null;
  const res = await pool.query(
    `SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [hashToken(token)]
  );
  if (res.rowCount === 0) return null;
  await pool.query(`UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1`, [hashToken(token)]);
  return res.rows[0];
}

export async function listUsers(): Promise<any[]> {
  const res = await pool.query(`SELECT id, name, email, role, created_at FROM users ORDER BY id`);
  return res.rows;
}

export async function setUserRole(userId: number, role: Role) {
  await pool.query(`UPDATE users SET role = $2, updated_at = now() WHERE id = $1`, [userId, role]);
}
