'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, ArrowUpRight, Play } from 'lucide-react';
import clsx from 'clsx';
import { api, type WorkflowRun, type Lead } from '@/lib/api';
import { StatusPill, EmptyState, timeAgo } from '@/components/ui';

const WORKFLOW_NAMES = ['Company Analysis', 'Lead Discovery', 'Email Send', 'Follow-up Sequence'];

export default function WorkflowsPage() {
  const [runs, setRuns] = useState<WorkflowRun[] | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    api
      .get<{ runs: WorkflowRun[] }>(`/api/workflow-runs${filter ? `?workflow_name=${encodeURIComponent(filter)}` : ''}`)
      .then((d) => setRuns(d.runs))
      .catch((e) => setError(e.message));
    api
      .get<{ leads: Lead[] }>('/api/leads')
      .then((d) => setLeads(d.leads))
      .catch(() => {});
  }, [filter]);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  async function promote(lead: Lead) {
    setBusy(lead.id);
    try {
      await api.post(`/api/leads/${lead.id}/promote`);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Workflows & Leads</h1>
        <p className="mt-1 text-sm text-ink-muted">n8n orchestration status and controlled lead discovery</p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      )}

      <div className="card mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="section-title">Workflow runs</div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('')}
              className={clsx('badge cursor-pointer', filter === '' ? 'border-electric/50 bg-electric/15 text-electric-bright' : 'border-obsidian-border text-ink-soft')}
            >
              All
            </button>
            {WORKFLOW_NAMES.map((w) => (
              <button
                key={w}
                onClick={() => setFilter(filter === w ? '' : w)}
                className={clsx('badge cursor-pointer', filter === w ? 'border-electric/50 bg-electric/15 text-electric-bright' : 'border-obsidian-border text-ink-soft')}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {!runs ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card skeleton h-12" />
            ))}
          </div>
        ) : runs.length === 0 ? (
          <EmptyState title="No workflow runs yet" hint="Runs appear here when n8n calls the workflow-run webhook" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-obsidian-border text-xs uppercase tracking-wider text-ink-muted">
                  <th className="pb-2.5 pr-4 font-medium">Workflow</th>
                  <th className="pb-2.5 pr-4 font-medium">Status</th>
                  <th className="pb-2.5 pr-4 font-medium">Trigger</th>
                  <th className="pb-2.5 pr-4 font-medium">Retries</th>
                  <th className="pb-2.5 pr-4 font-medium">Started</th>
                  <th className="pb-2.5 font-medium">Last error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-obsidian-border/50 last:border-0">
                    <td className="py-3 pr-4 font-medium text-ink">{r.workflow_name}</td>
                    <td className="py-3 pr-4">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="py-3 pr-4 text-xs text-ink-muted">{r.trigger || '—'}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-ink-soft">{r.retry_count}</td>
                    <td className="py-3 pr-4 text-xs text-ink-muted">{r.started_at ? timeAgo(r.started_at) : '—'}</td>
                    <td className="py-3 max-w-64 truncate text-xs text-red-400">{r.last_error || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="section-title">Discovered leads</div>
          <span className="badge border-violet/30 bg-violet/10 text-violet-bright">controlled sources only</span>
        </div>
        {!leads ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card skeleton h-12" />
            ))}
          </div>
        ) : leads.length === 0 ? (
          <EmptyState title="No leads yet" hint="Leads arrive from controlled sources via the /api/webhook/leads endpoint" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-obsidian-border text-xs uppercase tracking-wider text-ink-muted">
                  <th className="pb-2.5 pr-4 font-medium">Name</th>
                  <th className="pb-2.5 pr-4 font-medium">Source</th>
                  <th className="pb-2.5 pr-4 font-medium">Industry</th>
                  <th className="pb-2.5 pr-4 font-medium">Location</th>
                  <th className="pb-2.5 pr-4 font-medium">Status</th>
                  <th className="pb-2.5 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b border-obsidian-border/50 last:border-0">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-ink">{l.name}</div>
                      {l.website && <div className="text-xs text-ink-muted">{l.website.replace(/^https?:\/\//, '')}</div>}
                    </td>
                    <td className="py-3 pr-4 text-xs text-ink-muted">{l.source}</td>
                    <td className="py-3 pr-4 text-ink-soft">{l.industry || '—'}</td>
                    <td className="py-3 pr-4 text-ink-soft">{l.location || '—'}</td>
                    <td className="py-3 pr-4">
                      <StatusPill status={l.status} />
                    </td>
                    <td className="py-3">
                      {l.status === 'research' && l.company_id ? (
                        <a
                          href={`/companies/${l.company_id}`}
                          className="inline-flex items-center gap-1 text-xs text-electric-bright hover:text-electric"
                        >
                          View company <ArrowUpRight size={11} />
                        </a>
                      ) : (
                        <button className="btn-ghost px-3 py-1.5 text-xs" disabled={busy !== null} onClick={() => promote(l)}>
                          {busy === l.id ? <Loader2 size={11} className="animate-spin" /> : <Play size={11} />}
                          Promote to research
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
