import { useEffect, useState } from 'react';
import type { CameraController } from '../render/camera';
import { DEFAULT_ZOOM } from '../render/layout';
import { IconFit, IconMinus, IconPlus, IconTarget } from '../Icons';

/** Figma-style floating zoom control. 100% is the default framing of the intersection. */
export default function ZoomBar({ camera }: { camera: CameraController }) {
  const [zoom, setZoom] = useState(camera.target.zoom);
  useEffect(() => camera.subscribe((c) => setZoom(c.zoom)), [camera]);
  return (
    <div className="zoombar glass">
      <button className="zb" onClick={() => camera.zoomBy(1 / 1.25)} title="Zoom out"><IconMinus size={16} /></button>
      <button className="zb pct" onClick={() => camera.reset()} title="Reset view (double-click the map)">
        {Math.round((zoom / DEFAULT_ZOOM) * 100)}%
      </button>
      <button className="zb" onClick={() => camera.zoomBy(1.25)} title="Zoom in"><IconPlus size={16} /></button>
      <span className="zb-sep" />
      <button className="zb" onClick={() => camera.reset()} title="Center on the intersection"><IconTarget size={16} /></button>
      <button className="zb" onClick={() => camera.fitAll()} title="Fit the whole map"><IconFit size={16} /></button>
      <span className="zb-hint">Scroll to zoom · drag to pan</span>
    </div>
  );
}
