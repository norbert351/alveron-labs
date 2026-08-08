'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ScanSearch,
  Lightbulb,
  FileText,
  Send,
  Plus,
  ArrowUpRight,
} from 'lucide-react';
import { api, type Overview } from '@/lib/api';
import { StatCard, EmptyState, StatusPill, timeAgo } from '@/components/ui';
import { AnalyzeModal } from '@/components/AnalyzeModal';

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [analyzeOpen, setAnalyzeOpen] = useState(false);

  useEffect(() => {
    api
      .get<Overview>('/api/overview')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">
        Failed to reach the API: {error}
      </div>
    );
  }

  const funnel = data
    ? [
        { label: 'Companies', value: data.companies.total, color: 'bg-electric' },
        { label: 'Analyzed', value: data.companies.analyzed, color: 'bg-violet' },
        { label: 'Proposed', value: data.companies.proposed, color: 'bg-fuchsia-500' },
        { label: 'Outreach', value: data.companies.outreach, color: 'bg-emerald-400' },
      ]
    : [];

  const maxFunnel = Math.max(...funnel.map((f) => f.value), 1);

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Overview</h1>
          <p className="mt-1 text-sm text-ink-muted">Lead intelligence pipeline at a glance</p>
        </div>
        <button className="btn-primary" onClick={() => setAnalyzeOpen(true)}>
          <Plus size={15} /> Analyze a company
        </button>
      </div>

      {!data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card skeleton h-28" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Companies" value={data.companies.total} icon={<Building2 size={17} />} delay={0} />
            <StatCard
              label="Scans completed"
              value={data.scans.completed}
              icon={<ScanSearch size={17} />}
              delay={60}
            />
            <StatCard
              label="Opportunities"
              value={data.opportunities.total}
              sub={data.opportunities.avg_confidence ? `avg confidence ${Math.round(Number(data.opportunities.avg_confidence) * 100)}%` : 'none yet'}
              icon={<Lightbulb size={17} />}
              delay={120}
            />
            <StatCard
              label="Proposals"
              value={data.proposals.total}
              sub={`${data.proposals.sent} sent`}
              icon={<FileText size={17} />}
              delay={180}
            />
            <StatCard
              label="Outreach"
              value={data.outreach.total}
              sub={`${data.outreach.approved} approved · ${data.outreach.rejected} rejected`}
              icon={<Send size={17} />}
              delay={240}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card card-hover p-5 animate-fade-up" style={{ animationDelay: '280ms' }}>
              <div className="section-title mb-4">Pipeline funnel</div>
              <div className="space-y-3">
                {funnel.map((f, i) => (
                  <div key={f.label}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="text-ink-soft">{f.label}</span>
                      <span className="font-mono text-ink">{f.value}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-obsidian-raised">
                      <div
                        className={`h-full rounded-full ${f.color} transition-all duration-700`}
                        style={{
                          width: f.value > 0 ? `max(12%, ${(f.value / maxFunnel) * 100}%)` : '0%',
                          transitionDelay: `${i * 80}ms`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card card-hover p-5 animate-fade-up" style={{ animationDelay: '340ms' }}>
              <div className="section-title mb-4">Services matched</div>
              {data.byService.length === 0 ? (
                <EmptyState title="No matches yet" hint="Opportunities will appear after the first analysis completes" />
              ) : (
                <div className="space-y-2.5">
                  {data.byService.map((s) => (
                    <div key={s.matched_service} className="flex items-center justify-between rounded-lg bg-obsidian-raised/60 px-3 py-2.5">
                      <span className="text-sm text-ink-soft">{s.matched_service}</span>
                      <span className="badge border-electric/30 bg-electric/10 text-electric-bright">{s.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card mt-6 p-5 animate-fade-up" style={{ animationDelay: '400ms' }}>
            <div className="mb-4 flex items-center justify-between">
              <div className="section-title">Recent companies</div>
              <Link href="/companies" className="flex items-center gap-1 text-xs text-electric-bright hover:text-electric">
                View all <ArrowUpRight size={13} />
              </Link>
            </div>
            {data.recentCompanies.length === 0 ? (
              <EmptyState title="No companies yet" hint="Start by analyzing your first company" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-obsidian-border text-xs uppercase tracking-wider text-ink-muted">
                      <th className="pb-2.5 pr-4 font-medium">Company</th>
                      <th className="pb-2.5 pr-4 font-medium">Industry</th>
                      <th className="pb-2.5 pr-4 font-medium">Opportunities</th>
                      <th className="pb-2.5 pr-4 font-medium">Status</th>
                      <th className="pb-2.5 font-medium">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentCompanies.map((c) => (
                      <tr key={c.id} className="border-b border-obsidian-border/50 last:border-0">
                        <td className="py-3 pr-4">
                          <Link href={`/companies/${c.id}`} className="font-medium text-ink transition-colors hover:text-electric-bright">
                            {c.name}
                          </Link>
                          <div className="text-xs text-ink-muted">{c.website.replace(/^https?:\/\//, '')}</div>
                        </td>
                        <td className="py-3 pr-4 text-ink-soft">{c.industry || '—'}</td>
                        <td className="py-3 pr-4 font-mono text-ink-soft">{c.opportunity_count ?? 0}</td>
                        <td className="py-3 pr-4">
                          <StatusPill status={c.status} />
                        </td>
                        <td className="py-3 text-xs text-ink-muted">{timeAgo(c.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <AnalyzeModal open={analyzeOpen} onClose={() => setAnalyzeOpen(false)} />
    </div>
  );
}
