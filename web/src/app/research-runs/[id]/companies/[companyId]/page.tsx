'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import {
  api,
  type CompanyResearchDetail,
  type CompanyFinding,
  type CompanyOpportunity,
  type CompanyEvidence,
  type ResearchRun,
} from '@/lib/api';

function display(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function pct(v: number | string | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return `${Math.round(n * 100)}%`;
}

function EvTypeBadge({ type }: { type?: string }) {
  const t = (type || '').toUpperCase().trim();
  const label = t || '—';
  let cls = 'border-ink-muted/30 bg-ink-muted/10 text-ink-soft';
  if (t.startsWith('FACT')) cls = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  else if (t.startsWith('EVIDENCE')) cls = 'border-electric/40 bg-electric/10 text-electric-bright';
  else if (t.startsWith('AI')) cls = 'border-violet/40 bg-violet/10 text-violet-bright';
  return <span className={clsx('badge font-mono', cls)}>{label}</span>;
}

function SeverityBadge({ severity }: { severity?: string }) {
  if (!severity) return null;
  const s = severity.toLowerCase();
  let cls = 'border-ink-muted/30 bg-ink-muted/10 text-ink-soft';
  if (s.includes('critical') || s === 'high') cls = 'border-red-500/30 bg-red-500/10 text-red-400';
  else if (s.includes('high')) cls = 'border-amber-500/30 bg-amber-500/10 text-amber-400';
  else if (s.replace(/\s+/g, '') === 'medium') cls = 'border-amber-500/30 bg-amber-500/10 text-amber-400';
  else if (s === 'low') cls = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
  return <span className={clsx('badge', cls)}>{severity}</span>;
}

function FindingCards({ title, items }: { title: string; items: CompanyFinding[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-3 font-display text-sm font-semibold text-ink">{title} ({items.length})</h3>
      <div className="space-y-3">
        {items.map((f, i) => (
          <div key={i} className="card p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">{f.category || 'General'}</span>
              <SeverityBadge severity={f.severity} />
              {f.confidence !== undefined && <span className="ml-auto font-mono text-[11px] text-ink-soft">conf {pct(f.confidence)}</span>}
            </div>
            <div className="text-sm text-ink">{f.description || f.title || f.summary || '—'}</div>
            {f.evidence && f.evidence.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {f.evidence.map((ev: CompanyEvidence, j) => (
                  <div key={j} className="flex items-start gap-2 rounded-lg bg-obsidian-raised/60 p-2">
                    <EvTypeBadge type={ev.type} />
                    <span className="min-w-0 text-xs leading-relaxed text-ink-soft">
                      {ev.text && <span>{ev.text} </span>}
                      {ev.url && (
                        <a href={ev.url} target="_blank" rel="noreferrer" className="break-all text-electric-bright hover:underline">
                          {ev.url}
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OpportunityCards({ items }: { items: CompanyOpportunity[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-6">
      <h3 className="mb-3 font-display text-sm font-semibold text-ink">Scored opportunities ({items.length})</h3>
      <div className="space-y-3">
        {items.map((o, i) => (
          <div key={i} className="card p-4">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="font-display text-sm font-semibold text-ink">{o.title || 'Opportunity'}</span>
              <span className="ml-auto flex items-center gap-2">
                {o.priority && <span className="badge border-electric/40 text-electric-bright">{o.priority}</span>}
                {o.overall_score !== undefined && (
                  <span className="font-mono text-sm font-semibold text-ink">score {pct(o.overall_score)}</span>
                )}
              </span>
            </div>
            {o.description && <div className="text-sm text-ink-soft">{o.description}</div>}
            {o.components && Object.keys(o.components).length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(o.components).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-obsidian-raised/60 p-2.5">
                    <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">{k}</div>
                    <div className="mt-0.5 text-sm text-ink">{display(v)}</div>
                  </div>
                ))}
              </div>
            )}
            {o.service_codes && o.service_codes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {o.service_codes.map((s, j) => (
                  <span key={j} className="badge border-obsidian-border bg-obsidian-raised font-mono text-ink-soft">{s}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompanyDetailPage() {
  const params = useParams<{ id: string; companyId: string }>();
  const runId = params.id;
  const companyId = params.companyId;

  const [data, setData] = useState<CompanyResearchDetail | null>(null);
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!runId || !companyId) return;
    (async () => {
      try {
        const [d, r] = await Promise.all([
          api.get<CompanyResearchDetail>(`/api/research/companies/${companyId}?run_id=${runId}`),
          api.get<{ run: ResearchRun }>(`/api/research/runs/${runId}`),
        ]);
        setData(d);
        setRun(r.run);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [runId, companyId]);

  if (error) {
    return (
      <div className="mx-auto max-w-5xl animate-fade-up">
        <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl animate-fade-up">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card skeleton h-40" />
          ))}
        </div>
      </div>
    );
  }

  const company = data.company || {};
  const crawl = data.crawl_run || {};
  const recommendations = data.service_recommendations || [];

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-6">
        <a href={`/research-runs/${runId}`} className="text-xs text-ink-muted hover:text-electric-bright">← Run {runId}</a>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">
          {display(company.name) === '—' ? 'Company' : display(company.name)}
        </h1>
        {Boolean(company.website) && (
          <a href={display(company.website)} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-sm text-electric-bright hover:underline">
            {display(company.website)}
          </a>
        )}
      </div>

      {/* Crawl status */}
      <div className="card mb-6 p-5">
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Crawl status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg bg-obsidian-raised/60 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Status</div>
            <div className="mt-1 text-sm text-ink">{display(crawl.status)}</div>
          </div>
          <div className="rounded-lg bg-obsidian-raised/60 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Pages completed</div>
            <div className="mt-1 font-mono text-sm text-ink">{display(crawl.pages_completed ?? crawl.page_count)}</div>
          </div>
          <div className="rounded-lg bg-obsidian-raised/60 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Render used</div>
            <div className="mt-1 text-sm text-ink">{display(crawl.render_used)}</div>
          </div>
          <div className="rounded-lg bg-obsidian-raised/60 p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Error</div>
            <div className="mt-1 text-sm text-ink">{display(crawl.error)}</div>
          </div>
        </div>
      </div>

      {/* Findings & problems */}
      <FindingCards title="Findings" items={data.findings || []} />
      <FindingCards title="Problems" items={data.problems || []} />

      {/* Scored opportunities */}
      <OpportunityCards items={data.opportunities || []} />

      {/* Recommended services */}
      {recommendations.length > 0 && (
        <div className="card mb-6 p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-ink">Recommended services</h3>
          <div className="flex flex-wrap gap-1.5">
            {recommendations.map((s, i) => (
              <span key={i} className="badge border-obsidian-border bg-obsidian-raised font-mono text-ink-soft">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Raw evidence */}
      {data.evidence && data.evidence.length > 0 && (
        <div className="card mb-6 p-5">
          <h3 className="mb-3 font-display text-sm font-semibold text-ink">Evidence ({data.evidence.length})</h3>
          <div className="space-y-1.5">
            {data.evidence.map((ev, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-obsidian-raised/60 p-2">
                <EvTypeBadge type={ev.type} />
                <span className="min-w-0 text-xs leading-relaxed text-ink-soft">
                  {ev.text && <span>{ev.text} </span>}
                  {ev.url && (
                    <a href={ev.url} target="_blank" rel="noreferrer" className="break-all text-electric-bright hover:underline">
                      {ev.url}
                    </a>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}