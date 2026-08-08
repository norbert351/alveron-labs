import clsx from 'clsx';

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color =
    score >= 80
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
      : score >= 60
        ? 'border-electric/40 bg-electric/10 text-electric-bright'
        : score >= 40
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-400'
          : 'border-red-500/40 bg-red-500/10 text-red-300';
  const label = score >= 80 ? 'High' : score >= 60 ? 'Medium' : score >= 40 ? 'Low' : 'Poor fit';
  return (
    <span className={clsx('badge font-mono', color)} title={`Priority: ${label}`}>
      {score}
      <span className="text-[9px] opacity-70">/100</span>
    </span>
  );
}
