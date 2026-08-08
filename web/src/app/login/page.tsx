'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { saveSession } from '@/lib/auth';
import { Logo } from '@/components/Logo';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (mode === 'setup') {
        const d = await api.post<{ token: string; user: any }>('/api/auth/setup', { name, email, password });
        saveSession(d.token, d.user);
        router.push('/');
        return;
      }
      const d = await api.post<{ token: string; user: any }>('/api/auth/login', { email, password });
      saveSession(d.token, d.user);
      router.push('/');
    } catch (e: any) {
      if (mode === 'setup' && /Setup already completed/.test(e.message)) {
        setMode('login');
        setError('Setup already completed. Log in instead.');
      } else {
        setError(e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-obsidian p-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo withWordmark={false} />
          <div className="text-center">
            <div className="font-display text-xl font-semibold text-ink">Alveron Labs</div>
            <div className="text-xs uppercase tracking-widest text-ink-muted">Lead Intelligence</div>
          </div>
        </div>

        <div className="card p-6">
          <div className="mb-4 flex gap-2">
            <button
              onClick={() => setMode('login')}
              className={`badge cursor-pointer ${mode === 'login' ? 'border-electric/50 bg-electric/15 text-electric-bright' : 'border-obsidian-border text-ink-muted'}`}
            >
              Log in
            </button>
            <button
              onClick={() => setMode('setup')}
              className={`badge cursor-pointer ${mode === 'setup' ? 'border-electric/50 bg-electric/15 text-electric-bright' : 'border-obsidian-border text-ink-muted'}`}
            >
              First-run setup
            </button>
          </div>

          {error && (
            <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-300">{error}</div>
          )}

          {mode === 'setup' && (
            <div className="mb-3">
              <label className="label">Your name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Michael" />
            </div>
          )}
          <div className="mb-3">
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@alveronlabs.com" />
          </div>
          <div className="mb-4">
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="••••••••" />
            {mode === 'setup' && <p className="mt-1 text-[11px] text-ink-muted">At least 10 characters. The first user becomes the owner.</p>}
          </div>
          <button className="btn-primary w-full justify-center" onClick={submit} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            {mode === 'setup' ? 'Create owner account' : 'Log in'}
          </button>
        </div>
      </div>
    </div>
  );
}
