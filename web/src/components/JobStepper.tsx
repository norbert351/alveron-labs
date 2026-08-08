'use client';

import { Check, X, Loader2, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import type { Job, JobStep } from '@/lib/api';
import { JobStatusBadge } from './ui';

export function JobStepper({ job }: { job: Job | null }) {
  if (!job) {
    return (
      <div className="card flex items-center justify-center gap-2 p-6 text-sm text-ink-muted">
        No analysis job for this company yet.
      </div>
    );
  }

  const steps = job.steps;
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="section-title">Analysis pipeline</div>
        <div className="flex items-center gap-2">
          {job.status === 'running' && <Loader2 size={14} className="animate-spin text-electric" />}
          <JobStatusBadge status={job.status} />
        </div>
      </div>

      <div className="grid gap-2">
        {steps.map((step, i) => (
          <StepRow key={step.key} step={step} index={i} last={i === steps.length - 1} />
        ))}
      </div>

      {job.status === 'failed' && job.error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <div className="whitespace-pre-wrap font-mono">{job.error.slice(0, 400)}</div>
        </div>
      )}
    </div>
  );
}

function StepRow({ step, index, last }: { step: JobStep; index: number; last: boolean }) {
  const Icon =
    step.status === 'completed' ? Check : step.status === 'failed' ? X : step.status === 'running' ? Loader2 : null;
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div
          className={clsx(
            'flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors',
            step.status === 'completed' && 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400',
            step.status === 'failed' && 'border-red-500/40 bg-red-500/15 text-red-400',
            step.status === 'running' && 'border-electric/50 bg-electric/10 text-electric-bright',
            step.status === 'pending' && 'border-obsidian-border bg-obsidian-raised text-ink-muted'
          )}
        >
          {Icon ? (
            <Icon size={13} className={step.status === 'running' ? 'animate-spin' : ''} />
          ) : (
            <span className="font-mono text-[10px]">{index + 1}</span>
          )}
        </div>
        {!last && <div className={clsx('h-5 w-px', step.status === 'completed' ? 'bg-emerald-500/30' : 'bg-obsidian-border')} />}
      </div>
      <div className="pb-1 pt-1">
        <div
          className={clsx(
            'text-sm font-medium',
            step.status === 'completed' && 'text-ink',
            step.status === 'failed' && 'text-red-300',
            step.status === 'running' && 'text-ink',
            step.status === 'pending' && 'text-ink-muted'
          )}
        >
          {step.label}
        </div>
        {step.detail && <div className="mt-0.5 text-xs text-ink-muted">{step.detail}</div>}
      </div>
    </div>
  );
}
