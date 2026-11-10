// Shared gold formatter: exact cents trimmed to one decimal when exact
// ("1.08", "3.6", "4.0"), so every shown product holds (M3).
export function fmtGold(n: number): string {
  const fixed = n.toFixed(2);
  return fixed.endsWith('0') ? fixed.slice(0, -1) : fixed;
}
