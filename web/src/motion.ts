// motion.ts — one answer to "does this player want motion?".
//
// The scene, the criée and the toast stack all ask the same question, so
// they all ask it here. `prefers-reduced-motion` is a promise: no tween,
// no sweep, no animated slide. Only the picture changes.
export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
