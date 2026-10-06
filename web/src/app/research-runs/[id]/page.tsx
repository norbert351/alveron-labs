'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, type ResearchRunDetail, type ResearchCompanyResult, type ResearchRun } from '@/lib/api';
import { StatusPill, timeAgo, EmptyState } from '@/components/ui';

interface StatsCardProps {
  label: string;
  value: number | string;
}

function Stat({ label, value }: StatsCardProps) {
  return (
    <div className="rounded-lg bg-obsidian-raised/60 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-1 font-mono text-sm text-ink">{value ?? '—'}</div>
    </div>
  );
}

function StatsGrid({ s }: { s: ResearchRun['statistics'] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Discovered" value={s?.discovered} />
      <Stat label="Valid websites" value={s?.valid_websites} />
      <Stat label="Crawled" value={s?.crawled} />
      <Stat label="Analyzed" value={s?.analyzed} />
      <Stat label="Problems" value={s?.problems} />
      <Stat label="Opportunities" value={s?.opportunities} />
      <Stat label="Failed" value={s?.failed} />
      <Stat label="AI failed" value={s?.ai_failed} />
    </div>
  );
}

function location(r: ResearchCompanyResult): string {
  const parts = [r.city, r.region, r.country].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export default function RunDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<ResearchRunDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const d = await api.get<ResearchRunDetail>(`/api/research/runs/${id}`);
        setData(d);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [id]);

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

  const run = data.run;
  const target = [run.city, run.region, run.country].filter(Boolean).join(' · ') || '—';
  const errors = data.errors || [];

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-6">
        <a href="/research-runs" className="text-xs text-ink-muted hover:text-electric-bright">← Research Runs</a>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Run {run.run_id}</h1>
          <StatusPill status={run.status} />
          {data.is_running && (
            <span className="badge border-electric/40 text-electric-bright">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-electric" />
              Processing…
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {run.industry || 'Any industry'} · {target}
          {run.language ? ` · lang ${run.language}` : ''} · requested {run.requested_count} · created {timeAgo(run.created_at)}
        </p>
        {run.error && (
          <div className="mt-3 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300">{run.error}</div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="mb-3 font-display text-sm font-semibold text-ink">Statistics</h2>
        <StatsGrid s={run.statistics} />
      </div>

      {errors.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 font-display text-sm font-semibold text-ink">Run errors</h2>
          <ul className="space-y-1.5">
            {errors.map((e, i) => (
              <li key={i} className="rounded-lg border border-red-500/25 bg-red-500/5 p-2.5 font-mono text-xs text-red-300">
                {e}
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mb-3 font-display text-sm font-semibold text-ink">Companies</h2>
      {data.results.length === 0 ? (
        <EmptyState title="No company results yet" hint="This run has not produced company results yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-obsidian-border text-[10px] uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="px-4 py-3 font-medium">Problems</th>
                <th className="px-4 py-3 font-medium">Opportunities</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={`${r.company_id}`} className="border-b border-obsidian-border/50 last:border-0 hover:bg-obsidian-raised/40">
                  <td className="px-4 py-3">
                    <a
                      href={`/research-runs/${id}/companies/${r.company_id}`}
                      className="font-medium text-ink hover:text-electric-bright"
                    >
                      {r.company_name}
                    </a>
                    {r.website && (
                      <div>
                        <a href={r.website} target="_blank" rel="noreferrer" className="text-xs text-ink-muted hover:underline">
                          {r.website.replace(/^https?:\/\//, '')}
                        </a>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{location(r)}</td>
                  <td className="px-4 py-3 text-ink-soft">
                    <div className="max-w-[260px] truncate" title={r.outcome || ''}>{r.outcome || '—'}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{r.problems_count ?? 0}</td>
                  <td className="px-4 py-3 font-mono text-ink-soft">{r.opportunities_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}