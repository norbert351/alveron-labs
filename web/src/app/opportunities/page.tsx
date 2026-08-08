'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Sparkles, ArrowUpRight } from 'lucide-react';
import clsx from 'clsx';
import { api, type Opportunity } from '@/lib/api';
import { StatusPill, ServiceBadge, ConfidenceBar, EmptyState } from '@/components/ui';
import { ScoreBadge } from '@/components/ScoreBadge';

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState('');
  const [service, setService] = useState('');
  const [priority, setPriority] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'confidence' | 'recent'>('score');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (service) params.set('service', service);
    if (priority) params.set('priority', priority);
    api
      .get<{ opportunities: Opportunity[] }>(`/api/opportunities${params.toString() ? `?${params}` : ''}`)
      .then((d) => setOpps(d.opportunities))
      .catch((e) => setError(e.message));
  }, [service, priority]);

  useEffect(() => {
    load();
  }, [load]);

  const services = ['AI Automation', 'AI Agents', 'Custom Software', 'SaaS Development', 'Web Applications', 'Web3 Solutions'];
  const priorities = ['High', 'Medium', 'Low'];

  async function generateProposal(o: Opportunity) {
    setBusy(o.id);
    try {
      await api.post(`/api/opportunities/${o.id}/proposal`);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  const sorted = opps ? [...opps] : [];
  if (sortBy === 'score') sorted.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  else if (sortBy === 'confidence') sorted.sort((a, b) => Number(b.confidence) - Number(a.confidence));
  else sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Opportunities</h1>
          <p className="mt-1 text-sm text-ink-muted">Scored, evidence-backed opportunities matched to Alveron services</p>
        </div>
        <select
          className="input w-44"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
        >
          <option value="score">Sort by score</option>
          <option value="confidence">Sort by confidence</option>
          <option value="recent">Sort by newest</option>
        </select>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {services.map((s) => (
          <button
            key={s}
            onClick={() => setService(service === s ? '' : s)}
            className={`badge cursor-pointer transition-colors ${service === s ? 'border-electric/50 bg-electric/15 text-electric-bright' : 'border-obsidian-border text-ink-soft hover:border-electric/30'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {priorities.map((p) => (
          <button
            key={p}
            onClick={() => setPriority(priority === p ? '' : p)}
            className={`badge cursor-pointer transition-colors ${priority === p ? 'border-violet/50 bg-violet/15 text-violet-bright' : 'border-obsidian-border text-ink-soft hover:border-violet/30'}`}
          >
            {p} priority
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {!opps ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card skeleton h-36" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState title="No opportunities" hint="Analyze companies to surface opportunities, or clear the filters" />
      ) : (
        <div className="space-y-4">
          {sorted.map((o) => (
            <div key={o.id} className="card card-hover p-5 animate-fade-in">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <ScoreBadge score={o.score} />
                <ServiceBadge service={o.matched_service} />
                <StatusPill status={o.status} />
                <span className="ml-auto">
                  <ConfidenceBar value={o.confidence} />
                </span>
              </div>
              <div className="text-sm font-medium text-ink">{o.problem}</div>
              {o.company_name && (
                <Link href={`/companies/${o.company_id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-ink-muted hover:text-electric-bright">
                  {o.company_name} <ArrowUpRight size={11} />
                </Link>
              )}
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                <span className="text-ink-muted">Evidence: </span>
                {o.evidence}
              </p>
              {o.recommended_solution && (
                <div className="mt-2 rounded-lg border border-electric/15 bg-electric/5 p-3 text-sm text-ink-soft">
                  <span className="text-electric-bright">Solution: </span>
                  {o.recommended_solution}
                </div>
              )}
              {o.score_rationale && (
                <div className="mt-2 text-xs text-ink-muted">
                  <span className="text-ink-soft">Score rationale: </span>
                  {o.score_rationale}
                </div>
              )}
              {o.status === 'open' && (
                <div className="mt-3">
                  <button className="btn-primary" disabled={busy !== null} onClick={() => generateProposal(o)}>
                    {busy === o.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    Generate proposal
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
