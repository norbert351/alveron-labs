'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, ArrowUpRight } from 'lucide-react';
import { api, type Company } from '@/lib/api';
import { StatusPill, timeAgo, EmptyState } from '@/components/ui';
import { AnalyzeModal } from '@/components/AnalyzeModal';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [error, setError] = useState('');
  const [analyzeOpen, setAnalyzeOpen] = useState(false);

  useEffect(() => {
    api
      .get<{ companies: Company[] }>('/api/companies')
      .then((d) => setCompanies(d.companies))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Companies</h1>
          <p className="mt-1 text-sm text-ink-muted">Prospect companies in the intelligence pipeline</p>
        </div>
        <button className="btn-primary" onClick={() => setAnalyzeOpen(true)}>
          <Plus size={15} /> Analyze a company
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {!companies ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card skeleton h-16" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <EmptyState title="No companies yet" hint="Analyze your first company to start building the pipeline" />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-obsidian-border text-xs uppercase tracking-wider text-ink-muted">
                  <th className="px-5 py-3.5 font-medium">Company</th>
                  <th className="px-4 py-3.5 font-medium">Industry</th>
                  <th className="px-4 py-3.5 font-medium">Tech</th>
                  <th className="px-4 py-3.5 font-medium">Opportunities</th>
                  <th className="px-4 py-3.5 font-medium">Status</th>
                  <th className="px-5 py-3.5 font-medium">Added</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id} className="group border-b border-obsidian-border/50 transition-colors last:border-0 hover:bg-obsidian-raised/40">
                    <td className="px-5 py-4">
                      <Link href={`/companies/${c.id}`} className="group flex items-center gap-1 font-medium text-ink hover:text-electric-bright">
                        {c.name}
                        <ArrowUpRight size={13} className="opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                      <div className="text-xs text-ink-muted">{c.website.replace(/^https?:\/\//, '')}</div>
                    </td>
                    <td className="px-4 py-4 text-ink-soft">{c.industry || '—'}</td>
                    <td className="px-4 py-4">
                      <div className="flex max-w-56 flex-wrap gap-1">
                        {(c.technologies || []).slice(0, 3).map((t) => (
                          <span key={t} className="badge border-obsidian-border bg-obsidian-raised text-ink-soft">
                            {t}
                          </span>
                        ))}
                        {(c.technologies || []).length === 0 && <span className="text-xs text-ink-muted">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-ink-soft">{c.opportunity_count ?? 0}</td>
                    <td className="px-4 py-4">
                      <StatusPill status={c.status} />
                    </td>
                    <td className="px-5 py-4 text-xs text-ink-muted">{timeAgo(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnalyzeModal open={analyzeOpen} onClose={() => setAnalyzeOpen(false)} />
    </div>
  );
}
