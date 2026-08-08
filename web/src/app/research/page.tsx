'use client';

import { useEffect, useState } from 'react';
import { api, type Report, type Company } from '@/lib/api';
import { StatusPill, timeAgo, EmptyState, ServiceBadge } from '@/components/ui';

interface ResearchItem {
  report: Report;
  company: Company;
}

export default function ResearchPage() {
  const [items, setItems] = useState<ResearchItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const companies = (await api.get<{ companies: Company[] }>('/api/companies')).companies;
        const reports = await Promise.all(
          companies.map(async (c) => {
            const d = await api.get<{ report: Report | null }>(`/api/companies/${c.id}`);
            return { report: d.report, company: c };
          })
        );
        setItems(
          reports
            .filter((r) => r.report && r.report.summary)
            .map((r) => ({ report: r.report!, company: r.company }))
            .sort((a, b) => b.company.created_at.localeCompare(a.company.created_at))
        );
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Research</h1>
        <p className="mt-1 text-sm text-ink-muted">Structured company research from website analysis</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {!items ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card skeleton h-40" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No research reports yet" hint="Analyze a company to generate its research report" />
      ) : (
        <div className="space-y-4">
          {items.map(({ report, company }) => (
            <div key={report.id} className="card card-hover p-5 animate-fade-in">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <a href={`/companies/${company.id}`} className="font-display text-base font-semibold text-ink hover:text-electric-bright">
                  {company.name}
                </a>
                <span className="text-xs text-ink-muted">{company.website.replace(/^https?:\/\//, '')}</span>
                <span className="ml-auto flex items-center gap-2">
                  <StatusPill status={report.status} />
                  <span className="text-xs text-ink-muted">{timeAgo(report.created_at)}</span>
                </span>
              </div>

              <p className="text-sm leading-relaxed text-ink-soft">{report.summary}</p>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-obsidian-raised/60 p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Industry</div>
                  <div className="mt-1 text-sm text-ink">{company.industry || '—'}</div>
                </div>
                <div className="rounded-lg bg-obsidian-raised/60 p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Target customers</div>
                  <div className="mt-1 text-sm text-ink-soft">{company.target_customers || '—'}</div>
                </div>
                <div className="rounded-lg bg-obsidian-raised/60 p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Products & services</div>
                  <div className="mt-1 text-sm text-ink-soft">{company.products_services || '—'}</div>
                </div>
                <div className="rounded-lg bg-obsidian-raised/60 p-3">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">Observable technology</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(company.technologies || []).map((t) => (
                      <span key={t} className="badge border-obsidian-border bg-obsidian-raised font-mono text-ink-soft">
                        {t}
                      </span>
                    ))}
                    {(company.technologies || []).length === 0 && <span className="text-sm text-ink-muted">—</span>}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
