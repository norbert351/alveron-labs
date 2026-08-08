import clsx from 'clsx';

export function Logo({ size = 34, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
        <defs>
          <linearGradient id="alv-g" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
            <stop stopColor="#3D7EFF" />
            <stop offset="1" stopColor="#8B5CF6" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="10" stroke="url(#alv-g)" strokeOpacity="0.35" />
        <path
          d="M11 29 L20 10 L29 29"
          stroke="url(#alv-g)"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M15.4 23.5 L24.6 23.5" stroke="url(#alv-g)" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      {withWordmark && (
        <div className="leading-none">
          <div className="font-display text-[15px] font-semibold tracking-tight text-ink">
            Alveron <span className="text-ink-soft">Labs</span>
          </div>
          <div className={clsx('mt-0.5 text-[10px] uppercase tracking-[0.18em] text-ink-muted')}>
            Lead Intelligence
          </div>
        </div>
      )}
    </div>
  );
}
