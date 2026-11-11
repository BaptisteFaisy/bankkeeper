// SeaMap: the scene, dressed.
//
// The harbour is drawn in 3D (`scene3d/`) and falls back to the 2D chart
// (`scene/`) when the browser has no WebGL. This component mounts the
// canvas, hands the harbour to the renderer and keeps what the chart has
// always been good for: pick a boat, then a zone or the quay, with the
// mouse or with the keyboard. The canvas informs, the DOM controls act.
// prefers-reduced-motion and Math.min(window.devicePixelRatio || 1, 2) are
// honored by both engines.
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import type { LandingView, PortState, ZoneId } from '../types';
import { reducedMotion } from '../motion';
import { useChartKeys } from './chartKeys';
import { createScene, type Scene } from '../scene/scene';
import { sceneDescription, sceneEvents, sceneNarration, sceneState } from '../scene/bridge';
import type { SceneInput } from '../scene/bridge';
import { createScene3d, type Scene3d } from '../scene3d/scene3d';
import { pick2d } from './seaPick2d';

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

/** A drag longer than this turns the camera instead of picking. */
const DRAG_PX = 5;

function mount(canvas: HTMLCanvasElement, overlay: HTMLElement): { scene: Scene; three: Scene3d | null } {
  try {
    const three = createScene3d(canvas, overlay);
    return { scene: three, three };
  } catch {
    return { scene: createScene(canvas), three: null };
  }
}

export default function SeaMap(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const threeRef = useRef<Scene3d | null>(null);
  const previous = useRef<SceneInput | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [said, setSaid] = useState('');
  const [flat, setFlat] = useState(false);
  const boats = props.port?.boats ?? [];
  const keys = useChartKeys(boats, props.selectedBoat, props.onPickBoat, props.onPickZone, props.onPickQuay);

  useEffect(() => {
    const canvas = canvasRef.current, overlay = overlayRef.current;
    if (canvas === null || overlay === null) return;
    const made = mount(canvas, overlay);
    sceneRef.current = made.scene;
    threeRef.current = made.three;
    setFlat(made.three === null);
    return () => {
      made.scene.destroy();
      sceneRef.current = null;
      threeRef.current = null;
      previous.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (scene === null) return;
    const input: SceneInput = { port: props.port, live: props.live, price: props.price, selectedBoat: props.selectedBoat, now: performance.now() };
    const events = sceneEvents(previous.current, input);
    const narration = sceneNarration(previous.current, input);
    previous.current = input;
    scene.setState(sceneState(input));
    // prefers-reduced-motion: no tween at all, the picture changes instead.
    if (!reducedMotion()) for (const event of events) scene.emit(event);
    if (narration !== null) setSaid(narration);
  }, [props.port, props.live, props.price, props.selectedBoat]);

  function act(event: ReactMouseEvent): void {
    const three = threeRef.current;
    if (three === null) {
      const canvas = canvasRef.current;
      if (canvas !== null) pick2d(canvas, event, boats, props, sceneRef.current);
      return;
    }
    const hit = three.pick(event.clientX, event.clientY);
    if (hit === null) return;
    if (hit.kind === 'boat') props.onPickBoat(hit.id);
    else if (hit.kind === 'zone') props.onPickZone(hit.id as ZoneId);
    else props.onPickQuay();
  }

  function down(e: ReactPointerEvent<HTMLCanvasElement>): void {
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  }
  function move(e: ReactPointerEvent<HTMLCanvasElement>): void {
    const three = threeRef.current, d = drag.current;
    if (three === null) return;
    if (d !== null && (e.buttons & 1) === 1) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_PX) d.moved = true;
      if (d.moved) three.turn(e.movementX, e.movementY);
      return;
    }
    three.hover(e.clientX, e.clientY);
  }
  function up(e: ReactMouseEvent<HTMLCanvasElement>): void {
    const d = drag.current;
    drag.current = null;
    if (d === null || !d.moved) act(e);
  }
  function wheel(e: ReactWheelEvent<HTMLCanvasElement>): void {
    threeRef.current?.zoom(e.deltaY);
  }

  const label = `${keys.label} ${sceneDescription(props.port)}`.trim();
  return (
    <div className={flat ? 'sea-stage flat' : 'sea-stage'}>
      <canvas
        ref={canvasRef}
        className="sea-canvas"
        tabIndex={0}
        role="application"
        aria-label={label}
        onKeyDown={keys.onKeyDown}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onWheel={wheel}
      />
      <div ref={overlayRef} className="sea-labels" aria-hidden="true" />
      <p className="sr-only" role="status" aria-live="polite">{said}</p>
    </div>
  );
}
