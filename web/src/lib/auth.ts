'use client';

export interface User {
  id: number;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
}

const TOKEN_KEY = 'alveron_session_token';
const USER_KEY = 'alveron_session_user';

export function saveSession(token: string, user: User) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getSessionToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getSessionUser(): User | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function can(user: User | null, perm: string): boolean {
  if (!user) return false;
  const role = user.role;
  if (role === 'owner') return true;
  if (role === 'admin') return perm !== 'users:manage';
  return ['leads:view', 'outreach:view'].includes(perm);
}
