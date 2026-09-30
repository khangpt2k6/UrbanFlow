import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  side: 'left' | 'right';
  storageKey: string;
  defaultWidth: number;
  children: ReactNode;
}

const MIN_W = 200;
const MAX_W = 460;
const MIN_H = 160;

interface Size { w: number; h: number | null } // h = null: grow with content

function load(key: string, def: number): Size {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const s = JSON.parse(raw) as Size;
      if (typeof s.w === 'number') return { w: Math.min(MAX_W, Math.max(MIN_W, s.w)), h: typeof s.h === 'number' ? s.h : null };
    }
  } catch { /* storage blocked: fall back to defaults */ }
  return { w: def, h: null };
}

/**
 * A floating glass panel with Figma-style resize handles: drag the inner edge (↔) to change the
 * width, the bottom edge (↕) to cap the height (content scrolls), or the corner for both.
 * Double-click a handle to snap back to the default size. The size is remembered per panel.
 */
export default function ResizablePanel({ side, storageKey, defaultWidth, children }: Props) {
  const [size, setSize] = useState<Size>(() => load(storageKey, defaultWidth));
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; w: number; h: number; mode: 'w' | 'h' | 'wh' } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(size)); } catch { /* ignore */ }
  }, [size, storageKey]);

  const start = (e: React.PointerEvent<HTMLDivElement>) => {
    const mode = e.currentTarget.dataset.mode as 'w' | 'h' | 'wh';
    e.preventDefault();
    e.stopPropagation();
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    drag.current = { x: e.clientX, y: e.clientY, w: r.width, h: r.height, mode };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.classList.add(mode === 'w' ? 'resizing-w' : mode === 'h' ? 'resizing-h' : 'resizing-wh');
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) * (side === 'left' ? 1 : -1);
    const dy = e.clientY - d.y;
    const top = ref.current?.getBoundingClientRect().top ?? 62;
    const maxH = window.innerHeight - top - 76;
    setSize((s) => ({
      w: d.mode === 'h' ? s.w : Math.min(MAX_W, Math.max(MIN_W, d.w + dx)),
      h: d.mode === 'w' ? s.h : Math.min(maxH, Math.max(MIN_H, d.h + dy)),
    }));
  };
  const end = () => {
    drag.current = null;
    document.body.classList.remove('resizing-w', 'resizing-h', 'resizing-wh');
  };
  const reset = () => setSize({ w: defaultWidth, h: null });

  const handlers = { onPointerMove: move, onPointerUp: end, onPointerCancel: end, onDoubleClick: reset };
  return (
    <aside
      ref={ref}
      className={`hud-${side} glass panel`}
      style={{ width: size.w, height: size.h ?? undefined }}
    >
      <div className="panel-body">{children}</div>
      <div className={`rz rz-x rz-${side}`} data-mode="w" onPointerDown={start} {...handlers} title="Drag to resize · double-click to reset" />
      <div className="rz rz-y" data-mode="h" onPointerDown={start} {...handlers} title="Drag to resize · double-click to reset" />
      <div className={`rz rz-xy rz-${side}`} data-mode="wh" onPointerDown={start} {...handlers} />
    </aside>
  );
}
