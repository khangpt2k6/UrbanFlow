// UrbanFlow brand mark + wordmark. The mark is a tiny top-down intersection (white cross roads,
// yellow centre lines) on the brand blue->green gradient - a literal nod to what the app shows.

interface MarkProps {
  size?: number;
  className?: string;
}

export function LogoMark({ size = 40, className }: MarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="uf-grad" x1="4" y1="3" x2="43" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5b94ff" />
          <stop offset="0.52" stopColor="#2f6df6" />
          <stop offset="1" stopColor="#16a34a" />
        </linearGradient>
        <clipPath id="uf-clip">
          <rect x="2" y="2" width="44" height="44" rx="13" />
        </clipPath>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#uf-grad)" />
      <g clipPath="url(#uf-clip)">
        {/* cross roads */}
        <rect x="18" y="2" width="12" height="44" fill="#ffffff" opacity="0.95" />
        <rect x="2" y="18" width="44" height="12" fill="#ffffff" opacity="0.95" />
        {/* darker asphalt seam down each road centre */}
        <rect x="21" y="2" width="6" height="44" fill="#13243f" opacity="0.20" />
        <rect x="2" y="21" width="44" height="6" fill="#13243f" opacity="0.20" />
        {/* yellow centre dashes */}
        <line x1="24" y1="2" x2="24" y2="46" stroke="#ffd23f" strokeWidth="1.4" strokeDasharray="3 2.6" strokeLinecap="round" />
        <line x1="2" y1="24" x2="46" y2="24" stroke="#ffd23f" strokeWidth="1.4" strokeDasharray="3 2.6" strokeLinecap="round" />
        {/* a single car easing through the junction, for a hint of motion */}
        <rect x="20.4" y="31" width="7.2" height="5" rx="1.6" fill="#ff7a59" />
        <rect x="20.4" y="12.2" width="7.2" height="5" rx="1.6" fill="#22d3a6" />
      </g>
      <rect x="2.75" y="2.75" width="42.5" height="42.5" rx="12.4" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1.5" />
    </svg>
  );
}

interface LogoProps extends MarkProps {
  /** Font size of the wordmark in px; the mark scales to match if `size` is omitted. */
  fontSize?: number;
}

/** Mark + "UrbanFlow" wordmark, laid out horizontally. */
export function Logo({ size, fontSize = 20, className }: LogoProps) {
  return (
    <span className={`uf-logo ${className ?? ''}`} style={{ display: 'inline-flex', alignItems: 'center', gap: fontSize * 0.42 }}>
      <LogoMark size={size ?? Math.round(fontSize * 1.5)} />
      <span className="uf-word" style={{ fontSize, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1 }}>
        Urban<span className="uf-word-accent">Flow</span>
      </span>
    </span>
  );
}
