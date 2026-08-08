import clsx from 'clsx';

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color =
    score >= 75
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
      : score >= 50
        ? 'border-electric/40 bg-electric/10 text-electric-bright'
        : 'border-amber-500/40 bg-amber-500/10 text-amber-400';
  return (
    <span className={clsx('badge font-mono', color)}>
      {score}
      <span className="text-[9px] opacity-70">/100</span>
    </span>
  );
}
