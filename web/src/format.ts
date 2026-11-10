// Shared gold formatter: exact cents trimmed to one decimal when exact
// ("1.08", "3.6", "4.0"), so every shown product holds (M3).
export function fmtGold(n: number): string {
  const fixed = n.toFixed(2);
  return fixed.endsWith('0') ? fixed.slice(0, -1) : fixed;
}

// Crate counts with a thousands separator: 3000 -> "3,000". The debt owed to
// the sea is read in crates, so it gets the same separator the register uses.
export function fmtCrates(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
