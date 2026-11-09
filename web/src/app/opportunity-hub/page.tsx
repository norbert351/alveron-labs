'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, RefreshCw, Search, SlidersHorizontal, Target } from 'lucide-react';
import { api } from '@/lib/api';

type OpportunityType = 'remote_job' | 'paid_task' | 'agency_contract' | 'business_lead' | 'paid_research' | 'technical_content';
type OpportunityStatus = 'discovered' | 'reviewing' | 'qualified' | 'approved' | 'rejected' | 'applied' | 'closed' | 'expired';
interface DiscoveryRun { id: number; source_name: string; opportunity_type: string; status: string; discovered_count: number; new_count: number; duplicate_count: number; error: string | null; created_at: string; completed_at: string | null; }

interface OpportunityRecord {
  id: number;
  opportunity_type: OpportunityType;
  source_name: string;
  source_url: string;
  title: string;
  description: string | null;
  organization_name: string | null;
  location: string | null;
  is_remote: boolean;
  compensation_min: string | number | null;
  compensation_max: string | number | null;
  compensation_currency: string | null;
  compensation_period: string | null;
  deadline_at: string | null;
  required_skills: string[];
  evidence: Array<{ url?: string; text?: string; note?: string }>;
  fit_score: number | string | null;
  verification_status: string;
  status: OpportunityStatus;
  discovered_at: string;
  latest_outcome_type?: string | null;
  latest_outcome_at?: string | null;
  qualification?: { match?: { matched_skills?: string[]; missing_skills?: string[]; reasons?: string[] } };
}

const TYPES: { value: OpportunityType | ''; label: string }[] = [
  { value: '', label: 'All opportunity types' },
  { value: 'remote_job', label: 'Remote jobs' },
  { value: 'paid_task', label: 'Paid technical tasks' },
  { value: 'agency_contract', label: 'Agency contracts' },
  { value: 'business_lead', label: 'Business leads' },
  { value: 'paid_research', label: 'Paid research' },
  { value: 'technical_content', label: 'Technical content' },
];
const STATUSES: OpportunityStatus[] = ['discovered', 'reviewing', 'qualified', 'approved', 'rejected', 'applied', 'closed', 'expired'];

function money(o: OpportunityRecord) {
  if (o.compensation_min == null && o.compensation_max == null) return 'Compensation not listed';
  const currency = o.compensation_currency || '';
  const min = o.compensation_min == null ? null : Number(o.compensation_min).toLocaleString();
  const max = o.compensation_max == null ? null : Number(o.compensation_max).toLocaleString();
  const range = min && max ? (min === max ? min : min + ' - ' + max) : min || max;
  return [currency, range, o.compensation_period].filter(Boolean).join(' ');
}

export default function OpportunityHubPage() {
  const [items, setItems] = useState<OpportunityRecord[]>([]);
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [type, setType] = useState<OpportunityType | ''>('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<number, { event_type: string; notes: string }>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [applicationDrafts, setApplicationDrafts] = useState<Record<number, { subject: string; body: string; matched_skills: string[]; missing_skills: string[]; disclaimer: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      params.set('limit', '100');
      const [result, runResult] = await Promise.all([
        api.get<{ opportunities: OpportunityRecord[] }>('/api/opportunity-records?' + params.toString()),
        api.get<{ runs: DiscoveryRun[] }>('/api/opportunity-discovery/runs?limit=5'),
      ]);
      setItems(result.opportunities || []);
      setRuns(runResult.runs || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load opportunities');
    } finally {
      setLoading(false);
    }
  }, [type, status, search]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => ({
    total: items.length,
    qualified: items.filter((o) => o.status === 'qualified' || o.status === 'approved').length,
    verified: items.filter((o) => o.verification_status === 'verified').length,
  }), [items]);

  async function runDiscovery() {
    setDiscoveryBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.post<{ totals: { fetched: number; inserted: number; duplicates: number } }>('/api/opportunity-discovery/run');
      setNotice('Discovery finished. ' + result.totals.inserted + ' new opportunities added from ' + result.totals.fetched + ' listings.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discovery could not run');
    } finally {
      setDiscoveryBusy(false);
    }
  }


  function updateOutcomeDraft(id: number, field: 'event_type' | 'notes', value: string) {
    setOutcomeDrafts((current) => ({
      ...current,
      [id]: { event_type: current[id]?.event_type || 'follow_up', notes: current[id]?.notes || '', [field]: value },
    }));
  }

  async function recordOutcome(id: number) {
    const draft = outcomeDrafts[id] || { event_type: 'follow_up', notes: '' };
    setBusy(id);
    setError('');
    setNotice('');
    try {
      await api.post('/api/opportunity-records/' + id + '/outcomes', {
        event_type: draft.event_type,
        notes: draft.notes,
      });
      setNotice('Progress recorded.');
      setOutcomeDrafts((current) => ({ ...current, [id]: { event_type: 'follow_up', notes: '' } }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not record this outcome');
    } finally {
      setBusy(null);
    }
  }

  async function score(id: number) {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      const result = await api.post<{ match: { score: number } }>(`/api/opportunity-records/${id}/score`);
      setNotice('Match score updated: ' + result.match.score + '/100');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not score this opportunity');
    } finally {
      setBusy(null);
    }
  }

  async function generateApplicationDraft(id: number) {
    setBusy(id);
    setError('');
    setNotice('');
    try {
      const result = await api.post<{ draft: { subject: string; body: string; matched_skills: string[]; missing_skills: string[]; disclaimer: string } }>(`/api/opportunity-records/${id}/application-draft`);
      setApplicationDrafts((current) => ({ ...current, [id]: result.draft }));
      setNotice('Application draft generated. Review it before using.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate an application draft');
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(id: number, next: OpportunityStatus) {
    setBusy(id);
    setError('');
    try {
      await api.patch(`/api/opportunity-records/${id}`, { status: next });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-electric-bright">Alveron Labs / Discovery</div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">Opportunity Hub</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">One review queue for paid work, contracts, client leads and research opportunities.</p>
          <Link href="/opportunity-intelligence" className="mt-2 inline-flex text-xs text-electric-bright hover:underline">View intelligence briefing <ArrowUpRight size={12} className="ml-1" /></Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => void runDiscovery()} disabled={discoveryBusy}><RefreshCw size={14} className={discoveryBusy ? 'animate-spin' : ''} /> {discoveryBusy ? 'Discovering…' : 'Run discovery'}</button>
          <Link href="/opportunity-profile" className="btn-ghost"><Target size={14} /> Matching profile</Link>
          <button className="btn-ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4"><div className="text-xs text-ink-muted">Results in this view</div><div className="mt-1 font-display text-2xl text-ink">{counts.total}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-muted">Qualified or approved</div><div className="mt-1 font-display text-2xl text-ink">{counts.qualified}</div></div>
        <div className="card p-4"><div className="text-xs text-ink-muted">Verified sources</div><div className="mt-1 font-display text-2xl text-ink">{counts.verified}</div></div>
      </div>

      <div className="card mb-5 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_190px]">
          <label className="relative block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="input pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, company or description" />
          </label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as OpportunityType | '')}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-muted"><SlidersHorizontal size={12} /> Filters apply to the unified opportunity records.</div>
      </div>


      <section className="card mb-5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-ink">Recent discovery activity</div>
          <span className="text-[10px] uppercase tracking-wider text-ink-muted">Latest source runs</span>
        </div>
        {runs.length === 0 ? (
          <p className="text-xs text-ink-muted">No discovery runs have been recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-obsidian-border/60 pb-2 last:border-0 last:pb-0">
                <div>
                  <div className="text-xs font-medium text-ink">{run.source_name}</div>
                  <div className="text-[10px] text-ink-muted">{run.new_count} new · {run.duplicate_count} duplicates · {new Date(run.created_at).toLocaleString()}</div>
                  {run.error && <div className="mt-1 text-[10px] text-red-300">{run.error}</div>}
                </div>
                <span className="badge border-obsidian-border text-ink-muted">{run.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300">{error}</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-sm text-emerald-300">{notice}</div>}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map((n) => <div key={n} className="card skeleton h-36" />)}</div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="font-display text-lg text-ink">No matching opportunities yet</div>
          <p className="mt-2 text-sm text-ink-muted">The unified feed is ready to receive verified discoveries from source adapters. Existing company research remains available in the original Opportunities section.</p>
          <Link href="/research-runs" className="mt-4 inline-flex text-sm text-electric-bright hover:underline">Open business research <ArrowUpRight size={13} className="ml-1" /></Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((o) => {
            const match = o.qualification?.match;
            const scoreValue = o.fit_score == null ? null : Math.round(Number(o.fit_score));
            return (
              <article key={o.id} className="card card-hover p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="badge border-electric/30 bg-electric/10 text-electric-bright">{o.opportunity_type.replaceAll('_', ' ')}</span>
                      <span className="badge border-obsidian-border text-ink-muted">{o.verification_status}</span>
                      {o.is_remote && <span className="badge border-emerald-500/30 bg-emerald-500/10 text-emerald-300">Remote</span>}
                    </div>
                    <h2 className="text-base font-semibold text-ink">{o.title}</h2>
                    <div className="mt-1 text-xs text-ink-muted">{o.organization_name || 'Organization not listed'} · {o.location || 'Location not listed'} · via {o.source_name}</div>
                  </div>
                  <div className="min-w-24 text-right">
                    <div className="font-display text-xl text-ink">{scoreValue == null ? '—' : scoreValue + '/100'}</div>
                    <div className="text-[10px] uppercase tracking-wider text-ink-muted">Fit score</div>
                  </div>
                </div>
                {o.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{o.description}</p>}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted">
                  <span>{money(o)}</span>
                  {o.deadline_at && <span>Deadline {new Date(o.deadline_at).toLocaleDateString()}</span>}
                  <span>Found {new Date(o.discovered_at).toLocaleDateString()}</span>
                  {o.latest_outcome_type && <span>Latest progress: {o.latest_outcome_type.replaceAll('_', ' ')}{o.latest_outcome_at ? ' · ' + new Date(o.latest_outcome_at).toLocaleDateString() : ''}</span>}
                </div>
                {o.required_skills?.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{o.required_skills.map((skill) => <span key={skill} className="rounded-md bg-obsidian-raised px-2 py-1 text-[11px] text-ink-soft">{skill}</span>)}</div>}
                {match && <div className="mt-3 rounded-lg bg-obsidian-raised/70 p-3 text-xs text-ink-soft">
                  <div>Matched skills: {match.matched_skills?.join(', ') || 'None recorded'}</div>
                  {match.missing_skills?.length ? <div className="mt-1 text-amber-300">Missing skills: {match.missing_skills.join(', ')}</div> : null}
                  {match.reasons?.map((reason, i) => <div key={i} className="mt-1 text-ink-muted">{reason}</div>)}
                </div>}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-obsidian-border pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <a href={o.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-electric-bright hover:underline">Open original source <ArrowUpRight size={12} /></a>
                    <button className="btn-ghost text-xs" onClick={() => void score(o.id)} disabled={busy !== null}>{busy === o.id ? 'Scoring…' : 'Calculate fit'}</button>
                    <button className="btn-ghost text-xs" onClick={() => void generateApplicationDraft(o.id)} disabled={busy !== null}>{busy === o.id ? 'Preparing…' : 'Draft application'}</button>
                  </div>
                  <select aria-label={`Status for ${o.title}`} className="input w-auto min-w-36 text-xs" value={o.status} onChange={(e) => void changeStatus(o.id, e.target.value as OpportunityStatus)} disabled={busy !== null}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </select>
                </div>

                <details className="mt-3 border-t border-obsidian-border pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-electric-bright">Record review or application progress</summary>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[190px_1fr_auto]">
                    <select className="input text-xs" value={outcomeDrafts[o.id]?.event_type || 'follow_up'} onChange={(e) => updateOutcomeDraft(o.id, 'event_type', e.target.value)}>
                      <option value="reviewed">Reviewed</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="applied">Applied</option>
                      <option value="response_received">Response received</option>
                      <option value="interview">Interview</option>
                      <option value="offer">Offer</option>
                      <option value="won">Won</option>
                      <option value="lost">Lost</option>
                      <option value="no_response">No response</option>
                      <option value="follow_up">Follow-up</option>
                      <option value="closed">Closed</option>
                    </select>
                    <input className="input text-xs" value={outcomeDrafts[o.id]?.notes || ''} onChange={(e) => updateOutcomeDraft(o.id, 'notes', e.target.value)} placeholder="Optional notes, response details or next step" />
                    <button className="btn-ghost text-xs" onClick={() => void recordOutcome(o.id)} disabled={busy !== null}>{busy === o.id ? 'Saving…' : 'Save progress'}</button>
                  </div>
                  <p className="mt-2 text-[10px] text-ink-muted">This only records your progress. It never submits an application or contacts anyone.</p>
                </details>
                {applicationDrafts[o.id] && <details className="mt-3 border-t border-obsidian-border pt-3" open>
                  <summary className="cursor-pointer text-xs font-medium text-electric-bright">Application draft, review before use</summary>
                  <div className="mt-3 space-y-2">
                    <div className="text-xs text-ink-muted">Subject: {applicationDrafts[o.id].subject}</div>
                    <textarea className="input min-h-52 w-full text-xs leading-relaxed" readOnly value={applicationDrafts[o.id].body} />
                    <div className="text-xs text-ink-muted">Matched skills: {applicationDrafts[o.id].matched_skills.join(', ') || 'None recorded'}</div>
                    {applicationDrafts[o.id].missing_skills.length > 0 && <div className="text-xs text-amber-300">Missing skills: {applicationDrafts[o.id].missing_skills.join(', ')}</div>}
                    <p className="text-[10px] text-ink-muted">{applicationDrafts[o.id].disclaimer}</p>
                  </div>
                </details>}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
