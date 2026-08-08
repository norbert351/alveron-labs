'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Sparkles, ArrowUpRight } from 'lucide-react';
import { api, type Opportunity } from '@/lib/api';
import { StatusPill, ServiceBadge, ConfidenceBar, EmptyState } from '@/components/ui';

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<Opportunity[] | null>(null);
  const [error, setError] = useState('');
  const [service, setService] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    api
      .get<{ opportunities: Opportunity[] }>(`/api/opportunities${service ? `?service=${encodeURIComponent(service)}` : ''}`)
      .then((d) => setOpps(d.opportunities))
      .catch((e) => setError(e.message));
  }, [service]);

  useEffect(() => {
    load();
  }, [load]);

  const services = ['AI Automation', 'AI Agents', 'Custom Software', 'SaaS Development', 'Web Applications', 'Web3 Solutions'];

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

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Opportunities</h1>
        <p className="mt-1 text-sm text-ink-muted">Evidence-backed opportunities matched to Alveron services</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setService('')}
          className={`badge cursor-pointer transition-colors ${service === '' ? 'border-electric/50 bg-electric/15 text-electric-bright' : 'border-obsidian-border text-ink-soft hover:border-electric/30'}`}
        >
          All
        </button>
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

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {!opps ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card skeleton h-36" />
          ))}
        </div>
      ) : opps.length === 0 ? (
        <EmptyState title="No opportunities" hint="Analyze companies to surface opportunities, or clear the service filter" />
      ) : (
        <div className="space-y-4">
          {opps.map((o) => (
            <div key={o.id} className="card card-hover p-5 animate-fade-in">
              <div className="mb-2 flex flex-wrap items-center gap-2">
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
