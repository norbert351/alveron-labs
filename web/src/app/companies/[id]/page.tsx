'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Globe, Loader2, RefreshCw, FileText, Send, Sparkles, History } from 'lucide-react';
import clsx from 'clsx';
import { api, type CompanyDetail, PIPELINE_STAGES } from '@/lib/api';
import { StatusPill, ServiceBadge, ConfidenceBar, EmptyState, timeAgo } from '@/components/ui';
import { JobStepper } from '@/components/JobStepper';
import { ScoreBadge } from '@/components/ScoreBadge';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [stageNote, setStageNote] = useState('');

  const load = useCallback(() => {
    api
      .get<CompanyDetail>(`/api/companies/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function act(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setMsg('');
    try {
      await fn();
      await load();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy('');
    }
  }

  async function changeStage(stage: string) {
    await act('stage', () => api.patch(`/api/companies/${data!.company.id}/stage`, { stage, note: stageNote || undefined }));
    setStageNote('');
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-6xl">
        <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-300">{error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="card skeleton h-32" />
        <div className="card skeleton h-64" />
      </div>
    );
  }

  const { company, scan, report, opportunities, proposals, outreach, job, activity } = data;
  const jobActive = job && (job.status === 'pending' || job.status === 'running');
  const stageIndex = PIPELINE_STAGES.indexOf(company.stage as any);

  return (
    <div className="mx-auto max-w-6xl animate-fade-up">
      <Link href="/companies" className="mb-5 inline-flex items-center gap-1.5 text-xs text-ink-muted transition-colors hover:text-ink">
        <ArrowLeft size={13} /> Back to companies
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{company.name}</h1>
            <StatusPill status={company.status} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
            <a href={company.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-electric-bright">
              <Globe size={13} /> {company.website.replace(/^https?:\/\//, '')}
            </a>
            {company.industry && <span className="text-ink-muted">{company.industry}</span>}
            {company.lead_source && (
              <span className="badge border-violet/30 bg-violet/10 text-violet-bright">lead: {company.lead_source}</span>
            )}
          </div>
          {company.notes && <p className="mt-2 max-w-2xl text-sm text-ink-muted">{company.notes}</p>}
        </div>
        {!jobActive && (
          <button
            className="btn-ghost"
            onClick={() => act('reanalyzing', () => api.post(`/api/companies/${company.id}/reanalyze`))}
            disabled={!!busy}
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Re-analyze
          </button>
        )}
      </div>

      {msg && (
        <div className="mb-4 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-300">{msg}</div>
      )}

      {/* CRM pipeline */}
      <div className="card mb-6 p-5 animate-fade-in">
        <div className="mb-3 flex items-center justify-between">
          <div className="section-title">CRM pipeline</div>
          <div className="flex items-center gap-2">
            <input
              className="input w-56"
              placeholder="Note for this stage change (optional)"
              value={stageNote}
              onChange={(e) => setStageNote(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {PIPELINE_STAGES.map((s, i) => (
            <button
              key={s}
              onClick={() => changeStage(s)}
              disabled={!!busy}
              className={clsx(
                'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
                s === company.stage
                  ? 'border-electric/60 bg-alveron-gradient/20 text-electric-bright shadow-[0_0_16px_rgba(61,126,255,0.15)]'
                  : i < stageIndex
                    ? 'border-obsidian-border bg-obsidian-raised text-ink-soft hover:border-electric/30'
                    : 'border-obsidian-border text-ink-muted hover:border-electric/30 hover:text-ink-soft'
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <JobStepper job={job} />

          {report && report.status === 'completed' && (
            <div className="card card-hover p-5 animate-fade-in">
              <div className="section-title mb-3">Research summary</div>
              <p className="text-sm leading-relaxed text-ink-soft">{report.summary}</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Info label="Products & services" value={company.products_services} />
                <Info label="Target customers" value={company.target_customers} />
                <Info label="Main offering" value={company.main_offering} />
                <Info label="Observable technology" value={(company.technologies || []).join(', ') || 'None detected'} mono />
              </div>
            </div>
          )}

          {opportunities.length > 0 && (
            <div className="space-y-3">
              <div className="section-title">Detected opportunities</div>
              {opportunities.map((o) => (
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
                  <div className="mt-2 text-sm leading-relaxed text-ink-soft">
                    <span className="text-ink-muted">Evidence: </span>
                    {o.evidence}
                  </div>
                  {o.business_impact && (
                    <div className="mt-2 text-sm text-ink-soft">
                      <span className="text-ink-muted">Impact: </span>
                      {o.business_impact}
                    </div>
                  )}
                  {o.recommended_solution && (
                    <div className="mt-2 rounded-lg border border-electric/15 bg-electric/5 p-3 text-sm text-ink-soft">
                      <span className="text-electric-bright">Solution: </span>
                      {o.recommended_solution}
                    </div>
                  )}
                  {o.score && (
                    <div className="mt-3 flex flex-wrap gap-3 rounded-lg bg-obsidian-raised/60 p-3 text-[11px] text-ink-soft">
                      <span>Evidence <b className="font-mono text-ink">{o.score_evidence_quality}</b></span>
                      <span>Severity <b className="font-mono text-ink">{o.score_problem_severity}</b></span>
                      <span>Fit <b className="font-mono text-ink">{o.score_alveron_fit}</b></span>
                      <span>Value <b className="font-mono text-ink">{o.score_operational_value}</b></span>
                      <span>Feasibility <b className="font-mono text-ink">{o.score_feasibility}</b></span>
                      <span>Complexity <b className="font-mono text-ink">{o.score_complexity}/5</b></span>
                      {o.score_rationale && <span className="w-full text-ink-muted">{o.score_rationale}</span>}
                    </div>
                  )}
                  {o.status === 'open' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        className="btn-primary"
                        disabled={!!busy}
                        onClick={() => act('proposal', () => api.post(`/api/opportunities/${o.id}/proposal`))}
                      >
                        {busy === 'proposal' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Generate proposal
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          {scan && (
            <div className="card p-5">
              <div className="section-title mb-3">Website scan</div>
              <div className="space-y-2 text-sm">
                <Row label="URL" value={scan.url.replace(/^https?:\/\//, '')} mono />
                <Row label="Pages fetched" value={String(scan.page_count)} />
                <Row label="Findings" value={String(scan.findings?.length || 0)} />
                <Row label="Status" value={scan.status} />
              </div>
            </div>
          )}

          {proposals.length > 0 && (
            <div className="card p-5">
              <div className="section-title mb-3">Proposals</div>
              <div className="space-y-2.5">
                {proposals.map((p) => (
                  <div key={p.id} className="rounded-lg border border-obsidian-border bg-obsidian-raised/60 p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
                        <FileText size={12} /> Proposal #{p.id}
                      </span>
                      <StatusPill status={p.status} />
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed text-ink-muted">{p.opening}</p>
                    {p.status === 'draft' && (
                      <button
                        className="mt-2 inline-flex items-center gap-1 text-xs text-electric-bright hover:text-electric"
                        disabled={!!busy}
                        onClick={() => act('outreach', () => api.post(`/api/proposals/${p.id}/outreach`))}
                      >
                        {busy === 'outreach' ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                        Generate outreach email
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {outreach.length > 0 && (
            <div className="card p-5">
              <div className="section-title mb-3">Outreach</div>
              <div className="space-y-2.5">
                {outreach.map((o) => (
                  <div key={o.id} className="rounded-lg border border-obsidian-border bg-obsidian-raised/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium text-ink">{o.subject}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <div className="mt-1 text-[11px] text-ink-muted">
                      {o.status === 'sent' && o.sent_at ? `Sent ${timeAgo(o.sent_at)}` : `Drafted ${timeAgo(o.created_at)}`}
                      {o.approved_by && ` · approved by ${o.approved_by}`}
                      {o.latest_message && ` · ${o.latest_message.status}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card p-5">
            <div className="mb-3 flex items-center gap-2">
              <History size={15} className="text-ink-muted" />
              <div className="section-title">Activity history</div>
            </div>
            {activity && activity.length > 0 ? (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {activity.map((a) => (
                  <div key={a.id} className="rounded-lg bg-obsidian-raised/50 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-ink-soft">{a.action.replace(/_/g, ' ')}</span>
                      <span className="shrink-0 text-[10px] text-ink-muted">{timeAgo(a.created_at)}</span>
                    </div>
                    {a.action === 'stage_changed' && a.detail && (
                      <div className="mt-0.5 text-[11px] text-ink-muted">
                        {a.detail.from} → {a.detail.to}
                        {a.detail.note ? ` · ${a.detail.note}` : ''}
                      </div>
                    )}
                    <div className="text-[10px] text-ink-muted">{a.actor}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-ink-muted">No activity yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="rounded-lg bg-obsidian-raised/60 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={`mt-1 text-xs text-ink-soft ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={`truncate text-xs text-ink-soft ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}
