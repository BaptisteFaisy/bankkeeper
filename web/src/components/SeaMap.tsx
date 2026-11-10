// SeaMap: the scene, dressed.
//
// The drawing lives in `scene/` — this component mounts the canvas, hands
// the harbour to the renderer and keeps what the chart has always been good
// for: pick a boat, then a zone or the quay, with the mouse or with the
// keyboard. The canvas informs, the DOM controls act. Reduced motion and
// Math.min(window.devicePixelRatio || 1, 2) are honored by the scene engine.
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { BoatView, LandingView, PortState, ZoneId } from '../types';
import { reducedMotion } from '../motion';
import { useChartKeys } from './chartKeys';
import { createScene, type Scene } from '../scene/scene';
import { sceneDescription, sceneEvents, sceneNarration, sceneState } from '../scene/bridge';
import type { SceneInput } from '../scene/bridge';
import { QUAY, VIEW_H, VIEW_W, ZONE_RECTS, quayMark, zoneMark, type ZoneKey } from '../scene/layout';

interface Props {
  port: PortState | null;
  /** The lot the criée is replaying right now, if any. */
  live: LandingView | null;
  /** The price the sweep is at, in gold pieces. */
  price: number;
  selectedBoat: string | null;
  onPickBoat: (id: string) => void;
  onPickZone: (zone: ZoneId) => void;
  onPickQuay: () => void;
}

/** How near the pointer must be to take a hull. */
const PICK_RADIUS = 20;

type Pt = { x: number; y: number };

/** Deterministic spots of the boats, identical to the Fleet math. */
function boatSpots(boats: BoatView[]): Array<[string, Pt]> {
  const counts = new Map<string, number>();
  const out: Array<[string, Pt]> = [];
  for (const boat of boats) {
    const key = boat.zone ?? 'quay';
    const index = counts.get(key) ?? 0;
    counts.set(key, index + 1);
    const pt = boat.zone === null ? quayMark(index) : zoneMark(boat.zone, index);
    out.push([boat.id, pt]);
  }
  return out;
}

/** The point of the click, in the logical marks of the scene. */
function logicalPoint(canvas: HTMLCanvasElement, event: ReactMouseEvent): Pt {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * VIEW_W,
    y: ((event.clientY - rect.top) / rect.height) * VIEW_H,
  };
}

/** The zone under the pointer, if any. */
function zoneAt(p: Pt): ZoneKey | null {
  const keys = Object.keys(ZONE_RECTS) as ZoneKey[];
  return keys.find((id) => {
    const r = ZONE_RECTS[id];
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }) ?? null;
}

/** Is the pointer on the quay? */
function inQuay(p: Pt): boolean {
  return p.x >= QUAY.x && p.x <= QUAY.x + QUAY.w && p.y >= QUAY.y && p.y <= QUAY.y + QUAY.h;
}

export default function SeaMap(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const previous = useRef<SceneInput | null>(null);
  const [said, setSaid] = useState('');
  const boats = props.port?.boats ?? [];
  const keys = useChartKeys(boats, props.selectedBoat, props.onPickBoat, props.onPickZone, props.onPickQuay);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const scene = createScene(canvas);
    sceneRef.current = scene;
    return () => {
      scene.destroy();
      sceneRef.current = null;
      previous.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene === null) return;
    const input: SceneInput = {
      port: props.port,
      live: props.live,
      price: props.price,
      selectedBoat: props.selectedBoat,
      now: performance.now(),
    };
    const events = sceneEvents(previous.current, input);
    const narration = sceneNarration(previous.current, input);
    previous.current = input;
    scene.setState(sceneState(input));
    // prefers-reduced-motion: no tween at all, the picture changes instead.
    if (!reducedMotion()) {
      for (const event of events) scene.emit(event);
    }
    if (narration !== null) setSaid(narration);
  }, [props.port, props.live, props.price, props.selectedBoat]);

  function pickBoat(p: Pt): boolean {
    let best: { id: string; distance: number } | null = null;
    for (const [id, mark] of boatSpots(boats)) {
      const distance = Math.hypot(mark.x - p.x, mark.y - p.y);
      if (distance < PICK_RADIUS && (best === null || distance < best.distance)) {
        best = { id, distance };
      }
    }
    if (best === null) return false;
    props.onPickBoat(best.id);
    return true;
  }

  function handlePick(event: ReactMouseEvent): void {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const p = logicalPoint(canvas, event);
    if (pickBoat(p)) return;
    const zone = zoneAt(p);
    if (zone === null && !inQuay(p)) return;
    const scene = sceneRef.current;
    if (scene !== null && !reducedMotion()) scene.emit({ type: 'splash', x: p.x, y: p.y });
    if (zone !== null) props.onPickZone(zone);
    else props.onPickQuay();
  }

  const label = `${keys.label} ${sceneDescription(props.port)}`.trim();
  return (
    <>
      <canvas
        ref={canvasRef}
        className="sea-canvas"
        style={{ width: '100%', height: 'auto', aspectRatio: `${VIEW_W} / ${VIEW_H}` }}
        tabIndex={0}
        role="application"
        aria-label={label}
        onKeyDown={keys.onKeyDown}
        onClick={handlePick}
      />
      <p className="sr-only" role="status" aria-live="polite">{said}</p>
    </>
  );
}

