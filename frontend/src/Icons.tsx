// Minimal line icons (24px grid, 1.8 stroke), so the UI carries no emoji and no icon font.
import type { ReactNode } from 'react';

interface Props {
  size?: number;
  className?: string;
}

function Svg({ size = 18, className, children, fill = false }: Props & { children: ReactNode; fill?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconPlay = (p: Props) => <Svg {...p} fill><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></Svg>;
export const IconPause = (p: Props) => <Svg {...p} fill><rect x="6" y="5" width="4.2" height="14" rx="1.2" /><rect x="13.8" y="5" width="4.2" height="14" rx="1.2" /></Svg>;
export const IconReset = (p: Props) => <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></Svg>;
export const IconPlus = (p: Props) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconMinus = (p: Props) => <Svg {...p}><path d="M5 12h14" /></Svg>;
export const IconFit = (p: Props) => <Svg {...p}><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" /></Svg>;
export const IconTarget = (p: Props) => <Svg {...p}><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></Svg>;
export const IconChevron = (p: Props) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>;
export const IconSliders = (p: Props) => <Svg {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>;
export const IconActivity = (p: Props) => <Svg {...p}><path d="M3 12h4l3-8 4 16 3-8h4" /></Svg>;
export const IconShield = (p: Props) => <Svg {...p}><path d="M12 3 5 6v5c0 4.6 3 8.3 7 10 4-1.7 7-5.4 7-10V6l-7-3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></Svg>;
export const IconSiren = (p: Props) => <Svg {...p}><path d="M7 18v-6a5 5 0 0 1 10 0v6" /><path d="M5 21h14M12 3v1.5M4.2 6.2l1 1M19.8 6.2l-1 1" /><path d="M10 13a2 2 0 0 1 2-2" /></Svg>;
export const IconFlame = (p: Props) => <Svg {...p}><path d="M12 3c.5 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.4 1.3-3.6 2.4-4.8.3 1.6 1.1 2.6 2.1 2.8C11 8.6 10.8 5.6 12 3Z" /></Svg>;
export const IconSignal = (p: Props) => <Svg {...p}><rect x="8" y="2.5" width="8" height="19" rx="3" /><circle cx="12" cy="7" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="17" r="1.4" /></Svg>;
export const IconBell = (p: Props) => <Svg {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Svg>;
export const IconArrowRight = (p: Props) => <Svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const IconPanel = (p: Props) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M15 4v16" /></Svg>;
export const IconPanelLeft = (p: Props) => <Svg {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /></Svg>;
