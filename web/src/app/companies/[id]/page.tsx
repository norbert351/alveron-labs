'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Globe, Loader2, RefreshCw, FileText, Send, Sparkles } from 'lucide-react';
import { api, type CompanyDetail } from '@/lib/api';
import { StatusPill, ServiceBadge, ConfidenceBar, Spinner, EmptyState, timeAgo } from '@/components/ui';
import { JobStepper } from '@/components/JobStepper';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<CompanyDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');

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

  const { company, scan, report, opportunities, proposals, outreach, job } = data;
  const jobActive = job && (job.status === 'pending' || job.status === 'running');

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
                  {o.status === 'open' && (
                    <div className="mt-3 flex gap-2">
                      <button
                        className="btn-primary"
                        disabled={!!busy}
                        onClick={() =>
                          act('proposal', () => api.post(`/api/opportunities/${o.id}/proposal`))
                        }
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
                    {p.status !== 'sent' && (
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
                      {o.sent_at ? `Sent ${timeAgo(o.sent_at)}` : `Drafted ${timeAgo(o.created_at)}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {opportunities.length === 0 && !jobActive && (
            <EmptyState title="No opportunities yet" hint="Run an analysis to detect opportunities" />
          )}
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
