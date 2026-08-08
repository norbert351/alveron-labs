'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, type ActivityEvent } from '@/lib/api';
import { EmptyState, timeAgo } from '@/components/ui';

const EVENT_COLOR: Record<string, string> = {
  approved: 'text-emerald-400',
  sent: 'text-emerald-400',
  delivered: 'text-emerald-400',
  queued: 'text-amber-400',
  failed: 'text-red-300',
  bounced: 'text-red-300',
  reply: 'text-electric-bright',
  out_of_office: 'text-ink-soft',
  auto_response: 'text-ink-muted',
};

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .get<{ events: ActivityEvent[] }>('/api/email-activity')
      .then((d) => setEvents(d.events))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const filters = ['', 'reply', 'bounce', 'out_of_office', 'sent', 'failed'];
  const shown = events?.filter((e) => !filter || e.event === filter);

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Email Activity</h1>
        <p className="mt-1 text-sm text-ink-muted">Provider events: sends, deliveries, replies, bounces, auto-responses</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`badge cursor-pointer ${filter === f ? 'border-electric/50 bg-electric/15 text-electric-bright' : 'border-obsidian-border text-ink-muted'}`}
            >
              {f || 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-sm text-red-300">{error}</div>}

      {!shown ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card skeleton h-10" />
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState title="No events yet" hint="Events appear when emails are sent or providers report replies and bounces." />
      ) : (
        <div className="space-y-2">
          {shown.map((e) => {
            let detail: any = {};
            try {
              detail = e.detail ? JSON.parse(e.detail) : {};
            } catch {
              /* ignore */
            }
            return (
              <div key={e.id} className="card card-hover px-4 py-3 animate-fade-in">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-mono text-xs font-medium ${EVENT_COLOR[e.event] || 'text-ink-soft'}`}>{e.event}</span>
                  <span className="text-xs text-ink-muted">outreach #{e.outreach_id}</span>
                  {detail.from && <span className="font-mono text-xs text-ink-soft">{detail.from}</span>}
                  {detail.subject && <span className="truncate text-xs text-ink-muted">“{detail.subject.slice(0, 80)}”</span>}
                  <span className="ml-auto text-xs text-ink-muted">{timeAgo(e.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
