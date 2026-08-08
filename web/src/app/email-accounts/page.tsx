'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Plug, PlugZap, RefreshCw, Star, ExternalLink, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { api, type EmailAccount, type ProviderConfig, type EmailSafety } from '@/lib/api';
import { StatusPill, EmptyState, timeAgo } from '@/components/ui';
import { can, getSessionUser } from '@/lib/auth';

export default function EmailAccountsPage() {
  const [accounts, setAccounts] = useState<EmailAccount[] | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [safety, setSafety] = useState<EmailSafety | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const sp = useSearchParams();

  const user = getSessionUser();
  const manage = can(user, 'email:manage');

  const load = useCallback(() => {
    api
      .get<{ accounts: EmailAccount[]; providers: ProviderConfig[]; safety: EmailSafety }>('/api/email-accounts')
      .then((d) => {
        setAccounts(d.accounts);
        setProviders(d.providers);
        setSafety(d.safety);
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const oauthError = sp.get('oauth_error');
    const connected = sp.get('connected');
    if (oauthError) setNotice(`OAuth failed: ${oauthError}`);
    if (connected) setNotice(`Connected ${connected}`);
  }, [load, sp]);

  async function connect(kind: string) {
    setBusy(kind);
    setError('');
    try {
      const d = await api.post<{ auth_url: string; account_id: number }>('/api/email-accounts/connect', {
        provider: kind,
        purpose: 'outreach',
        label: `${kind} mailbox`,
      });
      window.location.href = d.auth_url;
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function test(id: number) {
    setBusy(`t${id}`);
    try {
      const d = await api.post<{ ok: boolean; detail: string }>(`/api/email-accounts/${id}/test`);
      setNotice(d.ok ? `Connection OK for account ${id}` : `Test failed: ${d.detail}`);
    } catch (e: any) {
      setNotice(`Test failed: ${e.message}`);
    } finally {
      setBusy('');
    }
  }

  async function disconnect(id: number) {
    setBusy(`d${id}`);
    try {
      await api.post(`/api/email-accounts/${id}/disconnect`);
      setNotice('Account disconnected and tokens cleared');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  async function makeDefault(id: number) {
    setBusy(`m${id}`);
    try {
      await api.post(`/api/email-accounts/${id}/default`, { purpose: 'outreach' });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Email Accounts</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Real OAuth connections. Tokens are encrypted at rest. Sending requires a connected default account.
          </p>
        </div>
        {safety?.pause_all && (
          <div className="badge border-red-500/40 bg-red-500/10 text-red-300">⚠ OUTREACH PAUSED GLOBALLY</div>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-200">{notice}</div>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {providers.map((p) => (
          <div key={p.kind} className="card card-hover p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium capitalize text-ink">{p.kind}</span>
              {p.configured ? (
                <span className="badge border-emerald-500/40 bg-emerald-500/10 text-emerald-400">configured</span>
              ) : (
                <span className="badge border-amber-500/40 bg-amber-500/10 text-amber-400">needs env vars</span>
              )}
            </div>
            <p className="mb-3 min-h-8 text-xs leading-relaxed text-ink-muted">
              {p.configured ? 'Ready to connect' : `Missing: ${p.missing.join(', ')}`}
            </p>
            <button className="btn-primary w-full justify-center" disabled={!p.configured || busy === p.kind || !manage} onClick={() => connect(p.kind)}>
              {busy === p.kind ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
              Connect {p.kind}
            </button>
          </div>
        ))}
      </div>

      {!accounts ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card skeleton h-24" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <EmptyState title="No email accounts connected" hint="Connect Gmail above. Google Cloud OAuth credentials are required (see docs/OAUTH.md)." />
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.id} className="card card-hover p-5 animate-fade-in">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium capitalize text-ink">{a.provider}</span>
                <span className="font-mono text-sm text-ink-soft">{a.email}</span>
                <StatusPill status={a.status} />
                {a.is_default && <span className="badge border-electric/50 bg-electric/15 text-electric-bright">default {a.purpose}</span>}
                <span className="ml-auto flex items-center gap-2">
                  {a.last_send_at && <span className="text-xs text-ink-muted">last send {timeAgo(a.last_send_at)}</span>}
                  <span className="text-xs text-ink-muted">
                    {a.daily_send_count} sent today{a.daily_send_date ? ` (${a.daily_send_date})` : ''}
                  </span>
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-ink-muted">
                {a.scopes?.map((s) => (
                  <span key={s} className="badge border-obsidian-border bg-obsidian-raised/60 font-mono">{s}</span>
                ))}
                {a.last_error && (
                  <span className="badge border-red-500/30 bg-red-500/10 text-red-300">{a.last_error.slice(0, 120)}</span>
                )}
              </div>
              {manage && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-obsidian-border pt-3">
                  <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy === `t${a.id}`} onClick={() => test(a.id)}>
                    {busy === `t${a.id}` ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Test connection
                  </button>
                  {!a.is_default && (
                    <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy === `m${a.id}`} onClick={() => makeDefault(a.id)}>
                      <Star size={11} /> Make default {a.purpose}
                    </button>
                  )}
                  <button className="btn-danger px-3 py-1.5 text-xs" disabled={busy === `d${a.id}`} onClick={() => disconnect(a.id)}>
                    <PlugZap size={11} /> Disconnect
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card mt-6 p-5">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-400" />
          <div className="section-title">Provider setup required</div>
        </div>
        <p className="text-xs leading-relaxed text-ink-muted">
          The Gmail provider is fully implemented but needs Google Cloud OAuth credentials before any mailbox can connect.
          Set <span className="font-mono text-ink-soft">GMAIL_CLIENT_ID</span>,{' '}
          <span className="font-mono text-ink-soft">GMAIL_CLIENT_SECRET</span> and the redirect URI in the API environment.
          Full instructions: <span className="font-mono text-ink-soft">docs/OAUTH.md</span>. Microsoft 365 needs{' '}
          <span className="font-mono text-ink-soft">MICROSOFT_CLIENT_ID</span> /{' '}
          <span className="font-mono text-ink-soft">MICROSOFT_CLIENT_SECRET</span>. Resend needs{' '}
          <span className="font-mono text-ink-soft">RESEND_API_KEY</span>.
        </p>
      </div>
    </div>
  );
}
