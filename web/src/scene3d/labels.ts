// labels.ts — words placed on the world: the grounds and their stock, a
// badge over every hull (a person for yours, an agent for the captains of
// the port), and the places of the quay when they matter. Decorative: the
// layer is aria-hidden, the same facts live in the DOM panels.

import { project, type Mat4, type Vec3 } from './math';
import { GROUNDS, type Hull } from './fleet';
import type { Place } from './harbour';
import type { SceneState } from '../scene/scene';

const SVG = 'http://www.w3.org/2000/svg';

/** A person (you) or an agent (a captain run by its rule). */
function icon(kind: 'you' | 'agent'): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  const add = (tag: string, attrs: Record<string, string>): void => {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  };
  if (kind === 'you') {
    add('circle', { cx: '8', cy: '5', r: '3' });
    add('path', { d: 'M2 15c0-4 2.5-6 6-6s6 2 6 6z' });
  } else {
    add('path', { d: 'M8 1v3', fill: 'none', 'stroke-width': '1.6' });
    add('rect', { x: '2.5', y: '4.5', width: '11', height: '9', rx: '2', fill: 'none', 'stroke-width': '1.6' });
    add('circle', { cx: '6', cy: '9', r: '1.2' });
    add('circle', { cx: '10', cy: '9', r: '1.2' });
  }
  return svg;
}

function el(cls: string, text = ''): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  if (text !== '') d.textContent = text;
  return d;
}

interface Tag { el: HTMLElement; pos: Vec3 }

export class Labels {
  private places = new Map<string, Tag>();
  private grounds: Array<{ tag: Tag; fill: HTMLElement; note: HTMLElement }> = [];
  private hulls = new Map<string, HTMLElement>();
  private flashes = new Map<string, number>();

  constructor(private layer: HTMLElement, places: Place[]) {
    for (const p of places) {
      const tag = el('lb3 place', p.text);
      layer.appendChild(tag);
      this.places.set(p.id, { el: tag, pos: p.pos });
    }
    for (const g of GROUNDS) {
      const tag = el('lb3 ground');
      tag.append(el('name', g.name), el('fish', g.fish));
      const bar = el('bar'), fill = el('fill'), note = el('note');
      bar.appendChild(fill);
      tag.append(bar, note);
      layer.appendChild(tag);
      this.grounds.push({ tag: { el: tag, pos: [g.x, 0, g.z + g.r + 4] }, fill, note });
    }
  }

  /** Light a place for a moment: the stall that buys, the chest that pays. */
  flash(id: string, ms: number): void { this.flashes.set(id, performance.now() + ms); }

  private hullTag(h: Hull): HTMLElement {
    let tag = this.hulls.get(h.id);
    if (tag === undefined) {
      tag = el(`lb3 hull ${h.mine ? 'you' : 'agent'}`);
      tag.appendChild(icon(h.mine ? 'you' : 'agent'));
      if (h.mine) tag.appendChild(el('who', 'You'));
      this.layer.appendChild(tag);
      this.hulls.set(h.id, tag);
    }
    tag.classList.toggle('picked', h.selected);
    tag.classList.toggle('idle', h.disarmed);
    return tag;
  }

  private put(tag: HTMLElement, vp: Mat4, p: Vec3, w: number, h: number): void {
    const q = project(vp, p);
    tag.style.transform = `translate(${((q[0] * 0.5 + 0.5) * w).toFixed(1)}px, ${((0.5 - q[1] * 0.5) * h).toFixed(1)}px)`;
    tag.style.visibility = q[2] > 0 ? 'visible' : 'hidden';
  }

  place(vp: Mat4, w: number, h: number, hulls: Hull[], state: SceneState | null): void {
    const now = performance.now();
    for (const [id, tag] of this.places) {
      tag.el.classList.toggle('on', (this.flashes.get(id) ?? 0) > now);
      this.put(tag.el, vp, tag.pos, w, h);
    }
    this.grounds.forEach((g, i) => {
      const zone = state?.zones.find((z) => z.id === GROUNDS[i].id);
      const boats = hulls.filter((x) => state?.boats.find((b) => b.id === x.id)?.zone === GROUNDS[i].id).length;
      g.fill.style.width = `${Math.round((zone?.stock ?? 1) * 100)}%`;
      g.note.textContent = `${boats} boat${boats === 1 ? '' : 's'}${zone?.debt === true ? ' · owes the sea' : ''}`;
      g.tag.el.classList.toggle('crowded', boats >= 6);
      this.put(g.tag.el, vp, g.tag.pos, w, h);
    });
    const live = new Set(hulls.map((x) => x.id));
    for (const [id, tag] of this.hulls) if (!live.has(id)) { tag.remove(); this.hulls.delete(id); }
    for (const x of hulls) this.put(this.hullTag(x), vp, [x.x, 8.5, x.z], w, h);
  }

  clear(): void { this.layer.replaceChildren(); this.hulls.clear(); }
}
