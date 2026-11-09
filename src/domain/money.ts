const lei0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const lei2 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 2 });

/** "1.270 lei" */
export function lei(n: number, decimals = false): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${(decimals ? lei2 : lei0).format(v)} lei`;
}

export function num(n: number, decimals = 1): string {
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: decimals }).format(Number.isFinite(n) ? n : 0);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
