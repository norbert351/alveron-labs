'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Send, ArrowUpRight } from 'lucide-react';
import { api, type Proposal } from '@/lib/api';
import { StatusPill, ServiceBadge, EmptyState, timeAgo } from '@/components/ui';

export default function ProposalsPage() {
  const [props, setProps] = useState<Proposal[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    api
      .get<{ proposals: Proposal[] }>('/api/proposals')
      .then((d) => setProps(d.proposals))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function generateOutreach(p: Proposal) {
    setBusy(p.id);
    try {
      await api.post(`/api/proposals/${p.id}/outreach`);
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
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Proposals</h1>
        <p className="mt-1 text-sm text-ink-muted">Personalized proposals, reviewed by a human before outreach</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      {!props ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card skeleton h-48" />
          ))}
        </div>
      ) : props.length === 0 ? (
        <EmptyState title="No proposals yet" hint="Generate a proposal from an opportunity to get started" />
      ) : (
        <div className="space-y-5">
          {props.map((p) => (
            <div key={p.id} className="card card-hover p-6 animate-fade-in">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="font-display text-base font-semibold text-ink">Proposal #{p.id}</span>
                <Link href={`/companies/${p.company_id}`} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-electric-bright">
                  {p.company_name} <ArrowUpRight size={11} />
                </Link>
                <span className="ml-auto flex items-center gap-2">
                  <StatusPill status={p.status} />
                  <span className="text-xs text-ink-muted">{timeAgo(p.created_at)}</span>
                </span>
              </div>

              <p className="text-sm leading-relaxed text-ink">{p.opening}</p>

              <div className="mt-4 space-y-2.5">
                <Section label="Observed opportunity" text={p.observed_opportunity} />
                <Section label="Evidence" text={p.evidence} />
                <Section label="Suggested solution" text={p.suggested_solution} accent />
                <Section label="Expected benefit" text={p.expected_benefit} />
                <Section label="Next step" text={p.next_step} />
              </div>

              {p.status !== 'sent' && (
                <div className="mt-4 border-t border-obsidian-border pt-4">
                  <button className="btn-primary" disabled={busy !== null} onClick={() => generateOutreach(p)}>
                    {busy === p.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Generate outreach email
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

function Section({ label, text, accent }: { label: string; text: string; accent?: boolean }) {
  if (!text) return null;
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">{label}</div>
      <p className={`mt-0.5 text-sm leading-relaxed ${accent ? 'text-electric-bright' : 'text-ink-soft'}`}>{text}</p>
    </div>
  );
}
