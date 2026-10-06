'use client';

import { useEffect, useState } from 'react';
import { api, type ResearchRun, type ResearchMeta } from '@/lib/api';
import { StatusPill, timeAgo, EmptyState } from '@/components/ui';

interface RunItem {
  run_id: string;
  country: string | null;
  region: string | null;
  city: string | null;
  industry: string | null;
  requested_count: number;
  status: string;
  statistics: {
    discovered: number;
    crawled: number;
    analyzed: number;
    opportunities: number;
  };
  created_at: string;
}

export default function ResearchRunsPage() {
  const [meta, setMeta] = useState<ResearchMeta | null>(null);
  const [runs, setRuns] = useState<RunItem[] | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [industry, setIndustry] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [city, setCity] = useState('');
  const [language, setLanguage] = useState('');
  const [count, setCount] = useState('20');

  async function load() {
    try {
      const [m, r] = await Promise.all([
        api.get<ResearchMeta>('/api/research/meta'),
        api.get<{ runs: ResearchRun[] }>('/api/research/runs'),
      ]);
      setMeta(m);
      setRuns(
        (r.runs || []).map((run) => ({
          run_id: run.run_id,
          country: run.country,
          region: run.region,
          city: run.city,
          industry: run.industry,
          requested_count: run.requested_count,
          status: run.status,
          statistics: run.statistics || { discovered: 0, crawled: 0, analyzed: 0, opportunities: 0 },
          created_at: run.created_at,
        }))
      );
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function startRun() {
    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/research/runs', {
        industry: industry || undefined,
        country: country || undefined,
        region: region || undefined,
        city: city || undefined,
        language: language || undefined,
        count: parseInt(count || '20', 10) || 20,
      });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const aiMissingAI = !meta?.ai?.configured;
  const missing = meta?.ai?.missing || [];

  function targetLabel(r: RunItem): string {
    const parts = [r.city, r.region, r.country].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : '—';
  }

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Research Runs</h1>
        <p className="mt-1 text-sm text-ink-muted">Global research runs across industries, regions and languages</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {aiMissingAI && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          <div className="font-medium">AI reasoning (Groq) is not configured — set GROQ_API_KEY.</div>
          <p className="mt-1 text-amber-200/80">
            The pipeline still runs discovery, crawling and deterministic evidence analysis, but AI problem detection,
            opportunity scoring and service recommendation are skipped.
          </p>
          {missing.length > 0 && (
            <div className="mt-2 font-mono text-xs text-amber-200">
              Missing: {missing.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* New run form */}
      <div className="card mb-8 p-5">
        <div className="mb-4 font-display text-sm font-semibold text-ink">New global research run</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-ink-muted">Industry</label>
            <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. logistics" className="input w-full" />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-ink-muted">Country</label>
            <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Germany" className="input w-full" />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-ink-muted">Region</label>
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Bavaria" className="input w-full" />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-ink-muted">City</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Munich" className="input w-full" />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-ink-muted">Language (optional)</label>
            <input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="e.g. de" className="input w-full" />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-wider text-ink-muted">Number of companies</label>
            <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className="input w-full" />
          </div>
        </div>
        <div className="mt-4">
          <button className="btn-primary" onClick={startRun} disabled={submitting}>
            {submitting ? 'Starting…' : 'Start Research'}
          </button>
        </div>
      </div>

      {/* Runs table */}
      <div className="mb-4 font-display text-sm font-semibold text-ink">Previous runs</div>
      {runs === null ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card skeleton h-24" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <EmptyState title="No research runs yet" hint="Start a new global research run above" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-obsidian-border text-[10px] uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-3 font-medium">Run</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Industry</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Stats</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.run_id} className="border-b border-obsidian-border/50 last:border-0 hover:bg-obsidian-raised/40">
                  <td className="px-4 py-3">
                    <a href={`/research-runs/${r.run_id}`} className="font-mono text-xs text-electric-bright hover:underline">
                      {r.run_id}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{targetLabel(r)}</td>
                  <td className="px-4 py-3 text-ink-soft">{r.industry || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] text-ink-soft">
                      <span>discovered {r.statistics.discovered ?? 0}</span>
                      <span>crawled {r.statistics.crawled ?? 0}</span>
                      <span>analyzed {r.statistics.analyzed ?? 0}</span>
                      <span>opportunities {r.statistics.opportunities ?? 0}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-ink-muted">{timeAgo(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}