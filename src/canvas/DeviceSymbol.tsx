import type { DeviceKind } from '../types';

interface DeviceSymbolProps {
  kind: DeviceKind;
  size?: number;
  dimmed?: boolean;
}

export function DeviceSymbol({ kind, size = 56, dimmed = false }: DeviceSymbolProps) {
  const strokeProps = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  };

  return (
    <svg
      className={`device-symbol device-symbol-${kind}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      style={{ opacity: dimmed ? 0.42 : 1, transition: 'opacity 160ms ease, transform 160ms ease' }}
    >
      <defs>
        <linearGradient id={`chassis-${kind}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--symbol-fill-top, #f4f7fb)" />
          <stop offset="100%" stopColor="var(--symbol-fill, #dfe7f2)" />
        </linearGradient>
        <linearGradient id={`bezel-${kind}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--symbol-bezel, #cad5e3)" stopOpacity="0.65" />
          <stop offset="100%" stopColor="var(--symbol-bezel-dark, #9fb0c7)" stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {kind === 'router' && (
        <g {...strokeProps}>
          <ellipse cx="32" cy="37" rx="22" ry="11" fill={`url(#bezel-${kind})`} />
          <path d="M10 27v10c0 6.08 9.85 11 22 11s22-4.92 22-11V27" fill={`url(#chassis-${kind})`} />
          <ellipse cx="32" cy="27" rx="22" ry="11" fill={`url(#chassis-${kind})`} />
          <ellipse cx="32" cy="27" rx="18.5" ry="8.5" strokeOpacity="0.35" strokeWidth="1" />
          <path d="M25 23l-6 3 6 3M19 26h10" strokeWidth="1.6" />
          <path d="M39 31l6-3-6-3M45 28H35" strokeWidth="1.6" />
          <path d="M29 21l3-3 3 3M32 18v6" strokeWidth="1.5" />
          <path d="M29 33l3 3 3-3M32 36v-6" strokeWidth="1.5" />
          <circle cx="19" cy="41" r="1.1" fill="currentColor" stroke="none" />
          <circle cx="24" cy="42.5" r="1.1" fill="currentColor" stroke="none" />
          <path d="M38 42.5h8" strokeWidth="1.3" strokeOpacity="0.6" />
        </g>
      )}

      {kind === 'switch' && (
        <g {...strokeProps}>
          <polygon points="12,20 52,20 57,27 7,27" fill={`url(#bezel-${kind})`} />
          <rect x="7" y="27" width="50" height="17" rx="2" fill={`url(#chassis-${kind})`} />
          <rect x="10" y="30" width="44" height="11" rx="1" fill={`url(#bezel-${kind})`} strokeWidth="1.1" />
          <path d="M21 22.5h10l-2-1.8M43 22.5H33l2-1.8" strokeWidth="1.3" />
          <path d="M19 25h10l-2 1.8M45 25H35l2 1.8" strokeWidth="1.3" />
          <rect x="13" y="32.5" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.75" />
          <rect x="19" y="32.5" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.75" />
          <rect x="25" y="32.5" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.75" />
          <rect x="31" y="32.5" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.75" />
          <rect x="37" y="32.5" width="4" height="3" rx="0.5" fill="currentColor" stroke="none" opacity="0.75" />
          <rect x="45" y="32.5" width="5" height="6" rx="0.6" strokeWidth="1.2" />
          <path d="M13 38h28" strokeWidth="1.1" strokeOpacity="0.55" />
        </g>
      )}

      {kind === 'hub' && (
        <g {...strokeProps}>
          <polygon points="13,23 51,23 55,29 9,29" fill={`url(#bezel-${kind})`} />
          <rect x="9" y="29" width="46" height="14" rx="2" fill={`url(#chassis-${kind})`} />
          <path d="M24 26h16M32 24v4" strokeWidth="1.3" />
          <rect x="14" y="33" width="5" height="6" rx="0.8" fill={`url(#bezel-${kind})`} strokeWidth="1.2" />
          <rect x="23" y="33" width="5" height="6" rx="0.8" fill={`url(#bezel-${kind})`} strokeWidth="1.2" />
          <rect x="32" y="33" width="5" height="6" rx="0.8" fill={`url(#bezel-${kind})`} strokeWidth="1.2" />
          <rect x="41" y="33" width="5" height="6" rx="0.8" fill={`url(#bezel-${kind})`} strokeWidth="1.2" />
          <circle cx="50" cy="34.5" r="1" fill="currentColor" stroke="none" />
          <circle cx="50" cy="37.5" r="1" fill="currentColor" stroke="none" />
        </g>
      )}

      {kind === 'wireless-router' && (
        <g {...strokeProps}>
          <path d="M20 27V13M44 27V13" strokeWidth="1.8" />
          <circle cx="20" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="44" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <path d="M14 17a7.5 7.5 0 010-10M26 7a7.5 7.5 0 010 10" strokeWidth="1.2" strokeOpacity="0.65" />
          <path d="M38 17a7.5 7.5 0 010-10M50 7a7.5 7.5 0 010 10" strokeWidth="1.2" strokeOpacity="0.65" />
          <ellipse cx="32" cy="42" rx="21" ry="9" fill={`url(#bezel-${kind})`} />
          <path d="M11 33v9c0 4.97 9.4 9 21 9s21-4.03 21-9v-9" fill={`url(#chassis-${kind})`} />
          <ellipse cx="32" cy="33" rx="21" ry="9" fill={`url(#chassis-${kind})`} />
          <path d="M23 31h10l-2.5-2.5M41 35H31l2.5 2.5" strokeWidth="1.5" />
          <circle cx="21" cy="45" r="1" fill="currentColor" stroke="none" />
          <circle cx="26" cy="46.2" r="1" fill="currentColor" stroke="none" />
          <circle cx="31" cy="46.6" r="1" fill="currentColor" stroke="none" />
        </g>
      )}

      {kind === 'access-point' && (
        <g {...strokeProps}>
          <rect x="12" y="26" width="40" height="24" rx="7" fill={`url(#chassis-${kind})`} />
          <rect x="16" y="30" width="32" height="16" rx="4.5" fill={`url(#bezel-${kind})`} strokeWidth="1.1" />
          <circle cx="32" cy="38" r="4.5" fill={`url(#chassis-${kind})`} strokeWidth="1.4" />
          <circle cx="32" cy="38" r="1.4" fill="currentColor" stroke="none" />
          <path d="M22 20a15 15 0 0120 0" strokeWidth="1.5" />
          <path d="M17 15a22 22 0 0130 0" strokeWidth="1.4" strokeOpacity="0.7" />
          <path d="M26.5 24.5a8.5 8.5 0 0111 0" strokeWidth="1.5" />
        </g>
      )}

      {kind === 'pc' && (
        <g {...strokeProps}>
          <rect x="8" y="11" width="35" height="26" rx="2.5" fill={`url(#chassis-${kind})`} />
          <rect x="11" y="14" width="29" height="19" rx="1" fill={`url(#bezel-${kind})`} strokeWidth="1.1" />
          <path d="M21 37v7M30 37v7M16 44h19" strokeWidth="1.6" />
          <rect x="46" y="15" width="10" height="29" rx="1.8" fill={`url(#chassis-${kind})`} />
          <path d="M49 20h4M49 24h4" strokeWidth="1.3" />
          <circle cx="51" cy="37" r="1.3" fill="currentColor" stroke="none" />
          <path d="M10 49h33l3 4H7z" fill={`url(#bezel-${kind})`} strokeWidth="1.2" />
          <path d="M15 19l5 5-5 5M22 29h6" strokeWidth="1.3" strokeOpacity="0.75" />
        </g>
      )}

      {kind === 'laptop' && (
        <g {...strokeProps}>
          <rect x="13" y="13" width="38" height="25" rx="2.5" fill={`url(#chassis-${kind})`} />
          <rect x="16" y="16" width="32" height="19" rx="1" fill={`url(#bezel-${kind})`} strokeWidth="1.1" />
          <circle cx="32" cy="14.5" r="0.8" fill="currentColor" stroke="none" />
          <path d="M13 38L7 47c-.7 1.1.1 2.5 1.4 2.5h47.2c1.3 0 2.1-1.4 1.4-2.5L51 38z" fill={`url(#chassis-${kind})`} />
          <path d="M15 41h34l2 3.5H13z" fill={`url(#bezel-${kind})`} strokeWidth="1" />
          <rect x="28" y="45.8" width="8" height="2" rx="0.5" strokeWidth="1" />
          <path d="M20 21l4 4-4 4M26 29h6" strokeWidth="1.3" strokeOpacity="0.75" />
        </g>
      )}

      {kind === 'server' && (
        <g {...strokeProps}>
          <rect x="16" y="8" width="32" height="48" rx="2.5" fill={`url(#chassis-${kind})`} />
          <rect x="19" y="12" width="26" height="9" rx="1" fill={`url(#bezel-${kind})`} strokeWidth="1.2" />
          <rect x="19" y="24" width="26" height="9" rx="1" fill={`url(#bezel-${kind})`} strokeWidth="1.2" />
          <rect x="19" y="36" width="26" height="9" rx="1" fill={`url(#bezel-${kind})`} strokeWidth="1.2" />
          <circle cx="22.5" cy="16.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="22.5" cy="28.5" r="1.2" fill="currentColor" stroke="none" />
          <circle cx="22.5" cy="40.5" r="1.2" fill="currentColor" stroke="none" />
          <path d="M27 15h14M27 18h10M27 27h14M27 30h10M27 39h14M27 42h10" strokeWidth="1.1" strokeOpacity="0.7" />
          <path d="M21 50h22M21 52.5h22" strokeWidth="1.2" strokeOpacity="0.55" />
        </g>
      )}

      {kind === 'printer' && (
        <g {...strokeProps}>
          <path d="M20 22V11h24v11" fill={`url(#bezel-${kind})`} />
          <path d="M24 15h16M24 18.5h11" strokeWidth="1.1" strokeOpacity="0.6" />
          <rect x="10" y="22" width="44" height="20" rx="3.5" fill={`url(#chassis-${kind})`} />
          <path d="M14 28h36" strokeWidth="1.1" strokeOpacity="0.45" />
          <rect x="19" y="36" width="26" height="16" rx="1.5" fill={`url(#bezel-${kind})`} />
          <path d="M23 41h18M23 45h18M23 49h12" strokeWidth="1.2" strokeOpacity="0.75" />
          <circle cx="47" cy="25.5" r="1.3" fill="currentColor" stroke="none" />
          <circle cx="43" cy="25.5" r="1.3" fill="currentColor" stroke="none" opacity="0.5" />
        </g>
      )}

      {kind === 'patch-panel' && (
        <g {...strokeProps}>
          <rect x="6" y="19" width="52" height="26" rx="2" fill={`url(#chassis-${kind})`} />
          <path d="M9 23v18M55 23v18" strokeWidth="1.4" strokeOpacity="0.55" />
          <circle cx="9" cy="23" r="1" fill="currentColor" stroke="none" />
          <circle cx="9" cy="41" r="1" fill="currentColor" stroke="none" />
          <circle cx="55" cy="23" r="1" fill="currentColor" stroke="none" />
          <circle cx="55" cy="41" r="1" fill="currentColor" stroke="none" />
          <rect x="12" y="23" width="40" height="8" rx="1" fill={`url(#bezel-${kind})`} strokeWidth="1.1" />
          <rect x="12" y="33" width="40" height="8" rx="1" fill={`url(#bezel-${kind})`} strokeWidth="1.1" />
          <path d="M16 27h3M22 27h3M28 27h3M34 27h3M40 27h3M46 27h3" strokeWidth="2.2" />
          <path d="M16 37h3M22 37h3M28 37h3M34 37h3M40 37h3M46 37h3" strokeWidth="2.2" />
        </g>
      )}
    </svg>
  );
}
