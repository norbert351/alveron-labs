'use client';

import { useEffect } from 'react';
import clsx from 'clsx';
import { X, Loader2 } from 'lucide-react';
import type { JobStatus } from '@/lib/api';

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; dot: string }> = {
    new: { label: 'New', className: 'border-ink-muted/30 text-ink-soft', dot: 'bg-ink-muted' },
    pending: { label: 'Pending', className: 'border-amber-500/30 text-amber-400', dot: 'bg-amber-400' },
    running: { label: 'Running', className: 'border-electric/40 text-electric-bright', dot: 'bg-electric animate-pulse-soft' },
    completed: { label: 'Completed', className: 'border-emerald-500/30 text-emerald-400', dot: 'bg-emerald-400' },
    failed: { label: 'Failed', className: 'border-red-500/30 text-red-400', dot: 'bg-red-400' },
    researched: { label: 'Researched', className: 'border-electric/40 text-electric-bright', dot: 'bg-electric' },
    analyzed: { label: 'Analyzed', className: 'border-violet/40 text-violet-bright', dot: 'bg-violet' },
    proposed: { label: 'Proposed', className: 'border-violet/40 text-violet-bright', dot: 'bg-violet' },
    outreach: { label: 'Outreach', className: 'border-emerald-500/30 text-emerald-400', dot: 'bg-emerald-400' },
    draft: { label: 'Draft', className: 'border-ink-muted/30 text-ink-soft', dot: 'bg-ink-muted' },
    approved: { label: 'Approved', className: 'border-emerald-500/30 text-emerald-400', dot: 'bg-emerald-400' },
    sent: { label: 'Sent', className: 'border-emerald-500/30 text-emerald-400', dot: 'bg-emerald-400' },
    rejected: { label: 'Rejected', className: 'border-red-500/30 text-red-400', dot: 'bg-red-400' },
    open: { label: 'Open', className: 'border-electric/40 text-electric-bright', dot: 'bg-electric' },
  };
  const s = map[status] || { label: status, className: 'border-ink-muted/30 text-ink-soft', dot: 'bg-ink-muted' };
  return (
    <span className={clsx('badge', s.className)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

export function ServiceBadge({ service }: { service: string | null }) {
  if (!service) return null;
  const colors: Record<string, string> = {
    'AI Automation': 'border-electric/40 bg-electric/10 text-electric-bright',
    'AI Agents': 'border-violet/40 bg-violet/10 text-violet-bright',
    'Custom Software': 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400',
    'SaaS Development': 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-400',
    'Web Applications': 'border-sky-500/40 bg-sky-500/10 text-sky-400',
    'Web3 Solutions': 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  };
  return (
    <span className={clsx('badge', colors[service] || 'border-ink-muted/30 bg-ink-muted/10 text-ink-soft')}>
      {service}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number | string }) {
  const v = Math.round(Number(value) * 100);
  const color = v >= 80 ? 'bg-emerald-400' : v >= 60 ? 'bg-electric' : 'bg-amber-400';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-obsidian-raised">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${v}%` }} />
      </div>
      <span className="font-mono text-[11px] text-ink-soft">{v}%</span>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div
        className={clsx(
          'relative w-full rounded-2xl border border-obsidian-border bg-obsidian-card shadow-2xl shadow-black/50 animate-fade-up',
          wide ? 'max-w-3xl' : 'max-w-lg'
        )}
      >
        <div className="flex items-center justify-between border-b border-obsidian-border px-5 py-4">
          <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-obsidian-raised hover:text-ink">
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-soft">
      <Loader2 size={15} className="animate-spin text-electric" />
      {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-obsidian-border py-14 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-obsidian-raised text-ink-muted">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-sm font-medium text-ink-soft">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  delay,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon?: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="card card-hover animate-fade-up p-5"
      style={{ animationDelay: `${delay || 0}ms` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-ink-muted">{label}</div>
          <div className="mt-2 font-display text-3xl font-semibold text-ink">{value}</div>
        </div>
        {icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-alveron-gradient/15 text-electric-bright">
            {icon}
          </div>
        )}
      </div>
      {sub && <div className="mt-2 text-xs text-ink-muted">{sub}</div>}
    </div>
  );
}

export function JobStatusBadge({ status }: { status: JobStatus }) {
  const map: Record<JobStatus, string> = {
    pending: 'border-amber-500/30 text-amber-400',
    running: 'border-electric/40 text-electric-bright',
    completed: 'border-emerald-500/30 text-emerald-400',
    failed: 'border-red-500/30 text-red-400',
  };
  return (
    <span className={clsx('badge', map[status])}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', status === 'running' && 'animate-pulse-soft')} />
      {status}
    </span>
  );
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
