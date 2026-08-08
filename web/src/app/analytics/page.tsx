'use client';

import { useEffect, useState } from 'react';
import { api, type Overview, PIPELINE_STAGES } from '@/lib/api';
import { StatCard, EmptyState } from '@/components/ui';

export default function AnalyticsPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Overview>('/api/overview')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-6xl rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">
        Failed to reach the API: {error}
      </div>
    );
  }

  const rates: { label: string; value: number | null; desc: string }[] = [
    { label: 'Researched / companies', value: data?.conversionRates.researched_to_company ?? null, desc: 'share of companies with completed analysis' },
    { label: 'Proposed / researched', value: data?.conversionRates.proposed_to_researched ?? null, desc: 'share of researched companies with a proposal' },
    { label: 'Approved / proposals', value: data?.conversionRates.approved_to_proposals ?? null, desc: 'share of proposals that reached approval' },
    { label: 'Sent / approved', value: data?.conversionRates.sent_to_approved ?? null, desc: 'share of approved emails actually sent' },
    { label: 'Rejected / total', value: data?.conversionRates.rejected_to_total ?? null, desc: 'share of outreach rejected in review' },
  ];

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Analytics</h1>
        <p className="mt-1 text-sm text-ink-muted">Pipeline health and conversion rates, computed from real records</p>
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
            <StatCard label="Companies discovered" value={data.companies.total} delay={0} />
            <StatCard label="Companies researched" value={data.companies.analyzed} delay={60} />
            <StatCard
              label="Qualified opportunities"
              value={data.opportunities.total}
              sub={`${data.opportunities.high} high · ${data.opportunities.medium} medium · ${data.opportunities.low} low`}
              delay={120}
            />
            <StatCard label="Proposals generated" value={data.proposals.total} sub={`${data.proposals.approved} approved`} delay={180} />
            <StatCard
              label="Emails"
              value={data.outreach.total}
              sub={`${data.outreach.approved} approved · ${data.outreach.sent} sent · ${data.outreach.failed + data.outreach.bounced} failed/bounced`}
              delay={240}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="card card-hover p-5 animate-fade-up" style={{ animationDelay: '280ms' }}>
              <div className="section-title mb-4">Conversion rates</div>
              <div className="space-y-3">
                {rates.map((r) => (
                  <div key={r.label} className="flex items-center justify-between rounded-lg bg-obsidian-raised/60 px-3 py-2.5">
                    <div>
                      <div className="text-sm text-ink-soft">{r.label}</div>
                      <div className="text-[11px] text-ink-muted">{r.desc}</div>
                    </div>
                    {r.value == null ? (
                      <span className="text-xs text-ink-muted">not enough data</span>
                    ) : (
                      <span className="font-mono text-lg text-electric-bright">{Math.round(r.value * 100)}%</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                Rates only appear when the denominator has data. Nothing here is estimated or fabricated.
              </p>
            </div>

            <div className="card card-hover p-5 animate-fade-up" style={{ animationDelay: '340ms' }}>
              <div className="section-title mb-4">CRM pipeline</div>
              {data.stages.length === 0 ? (
                <EmptyState title="No pipeline data yet" />
              ) : (
                <div className="space-y-2.5">
                  {PIPELINE_STAGES.map((stage) => {
                    const count = data.stages.find((s) => s.stage === stage)?.count ?? 0;
                    const max = Math.max(...data.stages.map((s) => s.count), 1);
                    return (
                      <div key={stage} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 text-xs text-ink-soft">{stage}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-obsidian-raised">
                          {count > 0 && (
                            <div
                              className="h-full rounded-full bg-alveron-gradient"
                              style={{ width: `${Math.max(6, (count / max) * 100)}%` }}
                            />
                          )}
                        </div>
                        <span className="w-6 text-right font-mono text-xs text-ink-soft">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
