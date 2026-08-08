'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { api, type QueueItem } from '@/lib/api';
import { StatusPill, EmptyState, timeAgo } from '@/components/ui';

const MSG_STATUS_COLOR: Record<string, string> = {
  queued: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  sending: 'border-electric/40 bg-electric/10 text-electric-bright',
  sent: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  delivered: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  failed: 'border-red-500/40 bg-red-500/10 text-red-300',
  bounced: 'border-red-500/40 bg-red-500/10 text-red-300',
};

export default function QueuePage() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .get<{ items: QueueItem[] }>('/api/outreach-queue')
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Outreach Queue</h1>
          <p className="mt-1 text-sm text-ink-muted">Real delivery state from the provider. Sent only after provider confirmation.</p>
        </div>
        <button className="btn-ghost" onClick={load}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300">{error}</div>}

      {!items ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card skeleton h-20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Nothing in the queue" hint="Approved outreach appears here. n8n sends it through the connected mailbox." />
      ) : (
        <div className="space-y-3">
          {items.map((o) => (
            <div key={o.id} className="card card-hover p-4 animate-fade-in">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/companies/1`} className="font-medium text-ink hover:text-electric-bright">
                  {o.target_company}
                </Link>
                <span className="text-sm text-ink-soft">· {o.subject}</span>
                <span className="ml-auto flex items-center gap-2">
                  {o.message_status && (
                    <span className={`badge font-mono ${MSG_STATUS_COLOR[o.message_status] || 'border-obsidian-border text-ink-soft'}`}>
                      {o.message_status}
                      {o.attempts > 0 && ` · ${o.attempts} attempts`}
                    </span>
                  )}
                  <StatusPill status={o.status} />
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
                {o.approved_by && <span>approved by {o.approved_by}{o.approved_at ? ` · ${timeAgo(o.approved_at)}` : ''}</span>}
                {o.provider && <span>provider: {o.provider}</span>}
                {o.provider_message_id && <span className="font-mono">id: {o.provider_message_id.slice(0, 24)}</span>}
                {o.sent_at && <span>sent {timeAgo(o.sent_at)}</span>}
                {o.failed_at && <span className="text-red-400">failed {timeAgo(o.failed_at)}</span>}
                {o.error_message && <span className="text-red-400">· {o.error_message.slice(0, 160)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
