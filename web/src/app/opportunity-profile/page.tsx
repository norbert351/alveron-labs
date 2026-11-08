'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '@/lib/api';

type Profile = {
  profile_key: string;
  display_name: string;
  skills: string[];
  experience: Record<string, unknown>;
  preferences: { remoteOnly?: boolean; preferredTypes?: string[] };
  constraints: { blockedTypes?: string[]; minimumCompensation?: number; allowedCurrencies?: string[] };
};
const TYPES = [
  ['remote_job', 'Remote jobs'],
  ['paid_task', 'Paid technical tasks'],
  ['agency_contract', 'Agency contracts'],
  ['business_lead', 'Business leads'],
  ['paid_research', 'Paid research'],
  ['technical_content', 'Technical content'],
];

export default function OpportunityProfilePage() {
  const [name, setName] = useState('Primary profile');
  const [skills, setSkills] = useState('');
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [preferred, setPreferred] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [minimum, setMinimum] = useState('');
  const [currencies, setCurrencies] = useState('USD, NGN');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get<{ profile: Profile }>('/api/opportunity-profile').then(({ profile }) => {
      setName(profile.display_name || 'Primary profile');
      setSkills((profile.skills || []).join(', '));
      setRemoteOnly(profile.preferences?.remoteOnly ?? false);
      setPreferred(profile.preferences?.preferredTypes || []);
      setBlocked(profile.constraints?.blockedTypes || []);
      setMinimum(profile.constraints?.minimumCompensation == null ? '' : String(profile.constraints.minimumCompensation));
      setCurrencies((profile.constraints?.allowedCurrencies || ['USD', 'NGN']).join(', '));
    }).catch((e) => setMessage(e.message)).finally(() => setLoading(false));
  }, []);

  function toggle(list: string[], setList: (next: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const parsedMinimum = minimum.trim() ? Number(minimum) : undefined;
      if (parsedMinimum !== undefined && (!Number.isFinite(parsedMinimum) || parsedMinimum < 0)) throw new Error('Minimum compensation must be a valid non-negative number.');
      await api.put('/api/opportunity-profile', {
        display_name: name,
        skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
        experience: {},
        preferences: { remoteOnly, preferredTypes: preferred },
        constraints: {
          blockedTypes: blocked,
          ...(parsedMinimum === undefined ? {} : { minimumCompensation: parsedMinimum }),
          allowedCurrencies: currencies.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
        },
      });
      setMessage('Matching profile saved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <Link href="/opportunity-hub" className="mb-5 inline-flex items-center gap-2 text-xs text-ink-muted hover:text-electric-bright"><ArrowLeft size={13} /> Back to Opportunity Hub</Link>
      <div className="mb-7">
        <div className="text-xs uppercase tracking-[0.18em] text-electric-bright">Personal matching</div>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">Opportunity Profile</h1>
        <p className="mt-1 text-sm text-ink-muted">Set your actual skills and preferences so Alveron Labs can explain why an opportunity may fit.</p>
      </div>
      {message && <div className="mb-4 rounded-lg border border-obsidian-border bg-obsidian-raised p-3 text-sm text-ink-soft">{message}</div>}
      {loading ? <div className="card skeleton h-64" /> : (
        <div className="space-y-5">
          <section className="card p-5">
            <label className="label">Profile name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            <label className="label mt-4">Skills</label>
            <textarea className="input min-h-28" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="TypeScript, React, Next.js, API integration, technical writing" />
            <p className="mt-2 text-xs text-ink-muted">Separate skills with commas. Only add skills you can genuinely demonstrate. Matching is based on the skills you enter.</p>
          </section>
          <section className="card p-5">
            <div className="mb-3 text-sm font-semibold text-ink">Work preferences</div>
            <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-electric" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} /> Prioritize remote opportunities</label>
            <div className="mt-4 text-xs text-ink-muted">Preferred opportunity types</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{TYPES.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-electric" checked={preferred.includes(value)} onChange={() => toggle(preferred, setPreferred, value)} /> {label}</label>)}</div>
          </section>
          <section className="card p-5">
            <div className="mb-3 text-sm font-semibold text-ink">Constraints</div>
            <label className="label">Minimum compensation amount</label>
            <input className="input" type="number" min="0" value={minimum} onChange={(e) => setMinimum(e.target.value)} placeholder="Leave blank if flexible" />
            <label className="label mt-4">Accepted currencies</label>
            <input className="input" value={currencies} onChange={(e) => setCurrencies(e.target.value)} placeholder="USD, NGN" />
            <div className="mt-4 text-xs text-ink-muted">Exclude opportunity types</div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">{TYPES.map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-electric" checked={blocked.includes(value)} onChange={() => toggle(blocked, setBlocked, value)} /> {label}</label>)}</div>
            <p className="mt-3 text-xs text-ink-muted">Compensation filtering is applied only when a source provides an amount. Missing compensation is shown as unknown, not treated as zero.</p>
          </section>
          <div className="flex justify-end"><button className="btn-primary" onClick={() => void save()} disabled={saving}><Save size={14} /> {saving ? 'Saving…' : 'Save matching profile'}</button></div>
        </div>
      )}
    </div>
  );
}
