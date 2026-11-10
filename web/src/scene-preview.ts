// scene-preview.ts — the scene engine on a fictional state.
//
// A standalone page: no React, no wasm, no /api. It walks through a
// day at the harbour (dawn, day, dusk, night), two boats that sail out
// and come home, a landing, an auction, a paid motion and a zone that
// runs dry, and tells in small print what is happening.

import './styles.css';
import { createScene, type Scene, type SceneState } from './scene/scene';
import { hex } from './scene/palette';
import type { BoatModel } from './scene/boats';
import type { SeaStall, SeaZone } from './scene/sea';
import type { HudView } from './scene/hud';

const LOOP_SECONDS = 54;
const AUCTION_PRICE = 42;
const AUCTION_FLOOR = 12;
const AUCTION_SPAN = 7;

interface Demo extends SceneState {
  auctionFrom: number;
  auctionTo: number;
  auctionStart: number;
  auctionEnd: number;
}

interface Step {
  at: number;
  caption: string;
  apply: (demo: Demo, scene: Scene) => void;
}

const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
const legend = document.getElementById('legend');

function freshDemo(): Demo {
  const boats: BoatModel[] = [
    { id: 'player', hull: hex('--buoy'), zone: null, mine: true, disarmed: false },
    { id: 'rival', hull: hex('--kelp'), zone: null, mine: false, disarmed: false },
  ];
  const zones: SeaZone[] = [
    { id: 'shallows', stock: 0.85, debt: false },
    { id: 'greybank', stock: 0.75, debt: false },
    { id: 'deeps', stock: 0.5, debt: false },
  ];
  const stalls: SeaStall[] = [
    { name: 'Fishmonger', kind: 'monger' },
    { name: 'Cannery', kind: 'cannery' },
    { name: 'Gull Inn', kind: 'inn' },
  ];
  const hud: HudView = {
    dayPhase: 0.02,
    dayLabel: 'Dawn',
    week: 1,
    auction: {
      active: false, price: AUCTION_PRICE, start: AUCTION_PRICE,
      endsAt: 0, buyer: -1, buyerName: '',
    },
    fund: { level: 0.12, amount: 240 },
    ledger: [
      { name: 'Aria', crates: 12, share: 0.42 },
      { name: 'Old Rook', crates: 9, share: 0.31 },
      { name: 'Bell', crates: 4, share: 0.14 },
    ],
  };
  return {
    boats, zones, stalls, hud,
    auctionFrom: AUCTION_PRICE, auctionTo: AUCTION_FLOOR,
    auctionStart: 16, auctionEnd: 16 + AUCTION_SPAN,
  };
}

function say(text: string): void {
  if (legend !== null) legend.textContent = text;
}

/** The phase of the day: dawn, day, dusk, then night. */
function dayPhase(t: number): number {
  if (t < 6) return 0.02 + (t / 6) * 0.12;
  if (t < 28) return 0.14 + ((t - 6) / 22) * 0.5;
  if (t < 40) return 0.64 + ((t - 28) / 12) * 0.26;
  return 0.9 + ((t - 40) / 14) * 0.1;
}

function dayLabel(t: number): string {
  if (t < 6) return 'Dawn';
  if (t < 28) return 'Day';
  if (t < 40) return 'Dusk';
  return 'Night';
}

/** The price of the criée falls while the lot is offered. */
function auctionPrice(demo: Demo, t: number): number {
  const span = demo.auctionEnd - demo.auctionStart;
  const k = Math.max(0, Math.min(1, (t - demo.auctionStart) / span));
  return Math.round(demo.auctionFrom + (demo.auctionTo - demo.auctionFrom) * k);
}

const steps: Step[] = [
  {
    at: 0,
    caption: 'Dawn on the harbour: two boats moored, the chest still shut.',
    apply: (demo) => {
      demo.boats[0].zone = null;
      demo.boats[1].zone = null;
    },
  },
  {
    at: 5,
    caption: 'The fleet sails out: hulls glide to their ground, they never jump.',
    apply: (demo) => {
      demo.boats[0].zone = 'shallows';
      demo.boats[1].zone = 'greybank';
    },
  },
  {
    at: 12,
    caption: 'The boat comes alongside: the catch comes off her deck.',
    apply: (demo) => {
      demo.boats[0].zone = null;
      demo.hud.ledger[0].crates += 6;
      demo.hud.ledger[0].share = 0.55;
    },
  },
  {
    at: 13.2,
    caption: 'Unloading: a crate arcs from the hull to the quay, and the water splashes.',
    apply: (_demo, scene) => {
      scene.emit({ type: 'land', boatId: 'player' });
    },
  },
  {
    at: 16,
    caption: 'The criée: the price falls, the fishmonger lights up, a gull follows the lot.',
    apply: (demo, scene) => {
      demo.boats[0].zone = 'deeps';
      demo.hud.auction.active = true;
      demo.hud.auction.buyer = 0;
      demo.hud.auction.buyerName = 'Fishmonger';
      demo.hud.auction.start = AUCTION_PRICE;
      scene.emit({ type: 'auction', stall: 0 });
    },
  },
  {
    at: 23,
    caption: 'The lot is sold: the price stops at the floor, the stall goes dark again.',
    apply: (demo) => {
      demo.hud.auction.active = false;
      demo.hud.auction.buyer = -1;
    },
  },
  {
    at: 26,
    caption: 'A motion is paid: the harbour chest opens and the fund swells.',
    apply: (_demo, scene) => {
      scene.emit({ type: 'chest' });
    },
  },
  {
    at: 32,
    caption: 'Greybank runs dry: the fish thin out, the water goes dull, a broken anchor shows the debt.',
    apply: (demo) => {
      demo.zones[1].stock = 0.08;
      demo.zones[1].debt = true;
      demo.boats[1].zone = null;
    },
  },
  {
    at: 40,
    caption: 'Dusk: the boats come home to the quay, the day cools over the water.',
    apply: (demo) => {
      demo.boats[0].zone = null;
      demo.boats[1].zone = null;
    },
  },
  {
    at: 48,
    caption: 'Night: the harbour sleeps, the chest keeps what the sea owes.',
    apply: (demo) => {
      demo.hud.fund.level = Math.min(1, demo.hud.fund.level + 0.1);
    },
  },
];

function run(): void {
  if (canvas === null) return;
  const scene = createScene(canvas);
  const started = performance.now();
  let demo = freshDemo();
  let last = 0;
  let fired = 0;
  scene.setState(demo);

  function tick(): void {
    const t = ((performance.now() - started) / 1000) % LOOP_SECONDS;
    if (t < last) {
      fired = 0;
      demo = freshDemo();
      scene.setState(demo);
      say(steps[0].caption);
    }
    last = t;
    while (fired < steps.length && steps[fired].at <= t) {
      steps[fired].apply(demo, scene);
      say(steps[fired].caption);
      fired += 1;
    }
    demo.hud.dayPhase = dayPhase(t);
    demo.hud.dayLabel = dayLabel(t);
    demo.hud.auction.price = auctionPrice(demo, t);
    demo.hud.auction.endsAt = started + demo.auctionEnd * 1000;
    const gain = Math.min(0.45, Math.max(0, (t - 6) / 30) * 0.45);
    demo.hud.fund.level = Math.min(1, 0.12 + gain);
    demo.hud.fund.amount = Math.round(demo.hud.fund.level * 2400);
    scene.setState(demo);
  }

  const timer = window.setInterval(tick, 100);
  window.addEventListener('beforeunload', () => {
    window.clearInterval(timer);
    scene.destroy();
  });
}

run();
