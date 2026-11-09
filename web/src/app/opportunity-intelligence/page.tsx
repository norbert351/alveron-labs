'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

type Summary = { total: number; active: number; approved: number; applied: number; past_deadline: number };
type BriefingItem = {
  id: number;
  title: string;
  organization_name: string | null;
  opportunity_type: string;
  source_name: string;
  source_url: string;
  compensation_min: number | string | null;
  compensation_max: number | string | null;
  compensation_currency: string | null;
  deadline_at: string | null;
  fit_score: number | null;
  priority_score: number;
  quality: { score: number; band: string; blockers: string[] };
};
type IntelligenceResponse = {
  summary: Summary;
  by_type: Array<{ opportunity_type: string; count: number }>;
  by_source: Array<{ source_name: string; count: number; latest_discovery: string }>;
  latest_discovery_run: { status: string; new_count: number; completed_at: string | null } | null;
};
type BriefingResponse = { generated_at: string; count: number; opportunities: BriefingItem[] };

function compensation(item: BriefingItem) {
  if (item.compensation_min == null && item.compensation_max == null) return 'Compensation not listed';
  const min = item.compensation_min == null ? null : Number(item.compensation_min).toLocaleString();
  const max = item.compensation_max == null ? null : Number(item.compensation_max).toLocaleString();
  const range = min && max && min !== max ? min + ' - ' + max : min || max;
  return [item.compensation_currency, range].filter(Boolean).join(' ');
}

export default function OpportunityIntelligencePage() {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [summary, ranked] = await Promise.all([
        api.get<IntelligenceResponse>('/api/opportunity-intelligence/summary'),
        api.get<BriefingResponse>('/api/opportunity-intelligence/briefing?limit=10'),
      ]);
      setData(summary);
      setBriefing(ranked);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load opportunity intelligence');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const metrics = [
    ['Total opportunities', data?.summary.total ?? 0],
    ['Active review queue', data?.summary.active ?? 0],
    ['Approved', data?.summary.approved ?? 0],
    ['Applications recorded', data?.summary.applied ?? 0],
    ['Past deadline', data?.summary.past_deadline ?? 0],
  ];

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/opportunity-hub" className="inline-flex items-center gap-1 text-xs text-electric-bright hover:underline"><ArrowLeft size={12} /> Opportunity Hub</Link>
          <div className="mt-3 text-xs uppercase tracking-[0.18em] text-electric-bright">Alveron Labs / Intelligence</div>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">Opportunity Intelligence</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">A ranked briefing based on profile fit, listing quality, freshness and deadlines.</p>
        </div>
        <button className="btn-ghost inline-flex items-center gap-2" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh briefing</button>
      </div>

      {error && <div role="alert" className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

      <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-5">
        {metrics.map(([label, value]) => <div key={label} className="card p-4"><div className="font-display text-2xl text-ink">{loading ? '—' : value}</div><div className="mt-1 text-xs text-ink-muted">{label}</div></div>)}
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><h2 className="font-display text-lg font-semibold text-ink">Today's review queue</h2><p className="text-xs text-ink-muted">Top opportunities by calculated priority. Always check the original listing before acting.</p></div>
          <span className="text-xs text-ink-muted">{briefing?.count ?? 0} ranked</span>
        </div>
        {loading ? <div className="card p-6 text-sm text-ink-muted">Loading ranked opportunities…</div> : !briefing?.opportunities.length ? <div className="card p-8 text-center"><h3 className="font-display text-base text-ink">No active opportunities yet</h3><p className="mt-2 text-sm text-ink-muted">Run discovery from the Opportunity Hub to populate the review queue.</p><Link href="/opportunity-hub" className="mt-4 inline-flex text-sm text-electric-bright hover:underline">Open Opportunity Hub <ArrowUpRight size={13} className="ml-1" /></Link></div> : <div className="space-y-3">
          {briefing.opportunities.map((item, index) => <article key={item.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2"><span className="badge border-electric/30 bg-electric/10 text-electric-bright">#{index + 1} priority</span><span className="badge border-obsidian-border text-ink-muted">{item.opportunity_type.replaceAll('_', ' ')}</span><span className="badge border-obsidian-border text-ink-muted">Quality {item.quality.score}/100</span></div>
                <h3 className="text-base font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-xs text-ink-muted">{item.organization_name || 'Organization not listed'} · {item.source_name}</p>
              </div>
              <div className="text-right"><div className="font-display text-2xl text-ink">{item.priority_score}/100</div><div className="text-[10px] uppercase tracking-wider text-ink-muted">Priority</div></div>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted"><span>{compensation(item)}</span>{item.fit_score != null && <span>Profile fit {Math.round(item.fit_score)}/100</span>}{item.deadline_at && <span>Deadline {new Date(item.deadline_at).toLocaleDateString()}</span>}</div>
            {item.quality.blockers.length > 0 && <div className="mt-3 rounded-lg bg-obsidian-raised/70 p-3 text-xs text-ink-muted"><span className="text-amber-300">Needs review: </span>{item.quality.blockers.slice(0, 3).join(' ')}</div>}
            <div className="mt-4 border-t border-obsidian-border pt-3"><a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-electric-bright hover:underline">Review original listing <ArrowUpRight size={12} /></a></div>
          </article>)}
        </div>}
      </section>

      <div className="grid gap-5 md:grid-cols-2">
        <section className="card p-5"><h2 className="font-display text-base font-semibold text-ink">Opportunity types</h2><div className="mt-4 space-y-3">{data?.by_type.map((row) => <div key={row.opportunity_type} className="flex items-center justify-between text-sm"><span className="text-ink-muted">{row.opportunity_type.replaceAll('_', ' ')}</span><span className="text-ink">{row.count}</span></div>)}</div></section>
        <section className="card p-5"><h2 className="font-display text-base font-semibold text-ink">Discovery sources</h2><div className="mt-4 space-y-3">{data?.by_source.map((row) => <div key={row.source_name} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-ink-muted">{row.source_name}</span><span className="shrink-0 text-ink">{row.count}</span></div>)}</div></section>
      </div>
      <p className="mt-5 text-[11px] leading-relaxed text-ink-muted">Quality and priority scores help organize research. They do not confirm that a listing is open, guarantee payment, or predict hiring success. Application drafts require human review and manual submission.</p>
    </div>
  );
}
