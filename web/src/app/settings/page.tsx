'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, KeyRound, Plus, Trash2, CalendarClock, Mail, AlertOctagon, Users } from 'lucide-react';
import { api, type SettingsData, type EmailSafety } from '@/lib/api';
import { getSessionUser } from '@/lib/auth';

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [services, setServices] = useState<{ name: string; description: string }[]>([]);
  const [days, setDays] = useState('');
  const [fuEnabled, setFuEnabled] = useState(true);
  const [maxFollowUps, setMaxFollowUps] = useState(2);
  const [provider, setProvider] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const user = getSessionUser();
  // email safety
  const [safety, setSafety] = useState<EmailSafety>({ pause_all: false, daily_limit: 20, min_delay_minutes: 5, max_follow_ups: 2 });
  const [dailyLimit, setDailyLimit] = useState(20);
  const [minDelay, setMinDelay] = useState(5);
  const [maxFu, setMaxFu] = useState(2);
  // user management
  const [users, setUsers] = useState<{ id: number; name: string; email: string; role: string }[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPass, setNewUserPass] = useState('');

  useEffect(() => {
    api
      .get<SettingsData>('/api/settings')
      .then((d) => {
        setData(d);
        setBaseUrl(d.llm.baseUrl);
        setModel(d.llm.model);
        setServices(d.services);
        setDays(d.followUp.days.join(', '));
        setFuEnabled(d.followUp.enabled);
        setMaxFollowUps(d.followUp.max_follow_ups);
        setProvider(d.email.provider);
        setFromName(d.email.from_name);
        setFromEmail(d.email.from_email);
      })
      .catch((e) => setMsg({ kind: 'err', text: e.message }));

    api
      .get<{ safety: EmailSafety }>('/api/email-safety')
      .then((d) => {
        setSafety(d.safety);
        setDailyLimit(d.safety.daily_limit);
        setMinDelay(d.safety.min_delay_minutes);
        setMaxFu(d.safety.max_follow_ups);
      })
      .catch(() => {});
    if (user?.role === 'owner') {
      api
        .get<{ users: { id: number; name: string; email: string; role: string }[] }>('/api/users')
        .then((d) => setUsers(d.users))
        .catch(() => {});
    }
  }, [user?.role]);

  async function togglePause() {
    setBusy('pause');
    try {
      const d = await api.put<{ safety: EmailSafety }>('/api/email-safety', { pause_all: !safety.pause_all });
      setSafety(d.safety);
      setMsg({ kind: 'ok', text: d.safety.pause_all ? 'Outreach paused globally' : 'Outreach resumed' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  }

  async function saveSafety() {
    setBusy('safety');
    try {
      const d = await api.put<{ safety: EmailSafety }>('/api/email-safety', {
        daily_limit: dailyLimit,
        min_delay_minutes: minDelay,
        max_follow_ups: maxFu,
      });
      setSafety(d.safety);
      setMsg({ kind: 'ok', text: 'Safety limits saved' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  }

  async function changeRole(id: number, role: string) {
    try {
      await api.patch(`/api/users/${id}/role`, { role });
      setUsers(users.map((u) => (u.id === id ? { ...u, role } : u)));
      setMsg({ kind: 'ok', text: 'Role updated' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    }
  }

  async function addUser() {
    setBusy('adduser');
    try {
      await api.post('/api/users', { name: newUserName, email: newUserEmail, password: newUserPass, role: 'member' });
      const d = await api.get<{ users: { id: number; name: string; email: string; role: string }[] }>('/api/users');
      setUsers(d.users);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPass('');
      setMsg({ kind: 'ok', text: 'User added' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  }

  async function saveLlm() {
    setBusy('llm');
    setMsg(null);
    try {
      await api.put('/api/settings/llm', { baseUrl, model, apiKey });
      setApiKey('');
      setMsg({ kind: 'ok', text: 'LLM provider saved' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  }

  async function saveServices() {
    setBusy('svc');
    setMsg(null);
    try {
      await api.put('/api/settings/services', { services });
      setMsg({ kind: 'ok', text: 'Service catalog saved' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  }

  async function saveFollowUp() {
    setBusy('fu');
    setMsg(null);
    const parsed = days.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n) && n >= 0);
    if (parsed.length === 0) {
      setMsg({ kind: 'err', text: 'days must be comma-separated non-negative numbers' });
      setBusy('');
      return;
    }
    try {
      await api.put('/api/settings/follow-up', { enabled: fuEnabled, days: parsed, max_follow_ups: maxFollowUps });
      setMsg({ kind: 'ok', text: 'Follow-up sequence saved. Day 0 = initial email.' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  }

  async function saveEmail() {
    setBusy('email');
    setMsg(null);
    try {
      await api.put('/api/settings/email', { provider, from_name: fromName, from_email: fromEmail });
      setMsg({ kind: 'ok', text: 'Email settings saved (used by n8n for delivery)' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy('');
    }
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card skeleton h-48" />
        <div className="card skeleton h-64" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Settings</h1>
        <p className="mt-1 text-sm text-ink-muted">LLM provider, service catalog, email delivery, and follow-ups</p>
      </div>

      {msg && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            msg.kind === 'ok' ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300' : 'border-red-500/25 bg-red-500/5 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      )}

      <div className="card p-6">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound size={16} className="text-electric-bright" />
          <div className="section-title">LLM provider</div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Base URL</label>
            <input className="input font-mono" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.example.com/v1" />
          </div>
          <div>
            <label className="label">Model</label>
            <input className="input font-mono" value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-5.6-terra" />
          </div>
          <div>
            <label className="label">
              API key {data.llm.keySet && <span className="ml-1 normal-case text-emerald-400">· key configured</span>}
            </label>
            <input
              className="input font-mono"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={data.llm.keySet ? '•••••••• (leave empty to keep)' : 'Enter API key'}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={saveLlm} disabled={busy === 'llm'}>
            {busy === 'llm' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save provider
          </button>
        </div>
      </div>

      <div className="card mt-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Mail size={16} className="text-electric-bright" />
          <div className="section-title">Email delivery</div>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-ink-muted">
          Sent by n8n through a transactional provider. The Alveron API only records delivery status, it never sends directly.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Provider</label>
            <input className="input" value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="e.g. Resend, SendGrid, SES" />
          </div>
          <div>
            <label className="label">From name</label>
            <input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} />
          </div>
          <div>
            <label className="label">From email</label>
            <input className="input" value={fromEmail} onChange={(e) => setFromEmail(e.target.value)} placeholder="outreach@alveronlabs.com" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={saveEmail} disabled={busy === 'email'}>
            {busy === 'email' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save email
          </button>
        </div>
      </div>

      <div className="card mt-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <CalendarClock size={16} className="text-violet-bright" />
          <div className="section-title">Follow-up sequence</div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Send days (comma separated)</label>
            <input className="input font-mono" value={days} onChange={(e) => setDays(e.target.value)} placeholder="0, 4, 9" />
          </div>
          <div>
            <label className="label">Max follow-ups</label>
            <input className="input font-mono" type="number" min={0} max={10} value={maxFollowUps} onChange={(e) => setMaxFollowUps(Number(e.target.value))} />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" checked={fuEnabled} onChange={(e) => setFuEnabled(e.target.checked)} className="h-4 w-4 accent-electric" />
              Sequences enabled
            </label>
          </div>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
          Day 0 is the initial email. Sequences stop automatically when the company replies, is marked interested,
          rejected, becomes a customer, or outreach is paused.
        </p>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={saveFollowUp} disabled={busy === 'fu'}>
            {busy === 'fu' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save sequence
          </button>
        </div>
      </div>

      <div className="card mt-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <AlertOctagon size={16} className="text-red-400" />
          <div className="section-title">Email safety</div>
        </div>
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div>
            <div className="text-sm font-medium text-ink">Pause all outreach</div>
            <div className="text-xs text-ink-muted">Blocks new sends and follow-ups at the API level. Queued emails stay queued.</div>
          </div>
          <button
            className={`${safety.pause_all ? 'btn-danger' : 'btn-ghost'} justify-center`}
            onClick={togglePause}
            disabled={busy === 'pause'}
          >
            {busy === 'pause' ? <Loader2 size={14} className="animate-spin" /> : safety.pause_all ? 'Resume outreach' : 'PAUSE ALL OUTREACH'}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Daily send limit (per account)</label>
            <input className="input font-mono" type="number" min={1} max={500} value={dailyLimit} onChange={(e) => setDailyLimit(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Min delay between sends (minutes)</label>
            <input className="input font-mono" type="number" min={0} max={120} value={minDelay} onChange={(e) => setMinDelay(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">Max follow-ups per prospect</label>
            <input className="input font-mono" type="number" min={0} max={10} value={maxFu} onChange={(e) => setMaxFu(Number(e.target.value))} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={saveSafety} disabled={busy === 'safety'}>
            {busy === 'safety' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save safety limits
          </button>
        </div>
      </div>

      {user?.role === 'owner' && (
        <div className="card mt-6 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Users size={16} className="text-electric-bright" />
            <div className="section-title">User management</div>
          </div>
          <div className="mb-4 space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg bg-obsidian-raised/60 px-3 py-2.5">
                <div>
                  <div className="text-sm text-ink">{u.name}</div>
                  <div className="text-xs text-ink-muted">{u.email}</div>
                </div>
                <select
                  className="input w-32 font-mono text-xs"
                  value={u.role}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                >
                  <option value="owner">owner</option>
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input className="input" placeholder="Name" value={newUserName} onChange={(e) => setNewUserName(e.target.value)} />
            <input className="input" placeholder="Email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} />
            <input className="input" type="password" placeholder="Password (10+ chars)" value={newUserPass} onChange={(e) => setNewUserPass(e.target.value)} />
          </div>
          <div className="mt-3 flex justify-end">
            <button className="btn-primary" onClick={addUser} disabled={busy === 'adduser'}>
              {busy === 'adduser' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add user
            </button>
          </div>
        </div>
      )}

      <div className="card mt-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Plus size={16} className="text-violet-bright" />
          <div className="section-title">Service catalog</div>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-ink-muted">
          Opportunity detection recommends only services from this catalog.
        </p>
        <div className="space-y-3">
          {services.map((s, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto]">
              <input
                className="input"
                value={s.name}
                onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              <input
                className="input"
                value={s.description}
                onChange={(e) => setServices(services.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
              />
              <button className="btn-danger justify-center sm:w-10" onClick={() => setServices(services.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <button className="btn-ghost" onClick={() => setServices([...services, { name: '', description: '' }])}>
            <Plus size={14} /> Add service
          </button>
          <button className="btn-primary" onClick={saveServices} disabled={busy === 'svc'}>
            {busy === 'svc' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save catalog
          </button>
        </div>
      </div>
    </div>
  );
}
