// Indicator calculators for the strategy lab (docs/07 12-3).
// supertrend and jma are ported from kiwoom-desk addons/chart-indicators/plugins/supertrend.ts and jma.ts
// (main branch, read 2026-11-10). Keep the formulas identical to the chart (07 SV4). Output rounding for display is not applied.
export interface Bar { time: number; open: number; high: number; low: number; close: number; volume: number; }
export type Series = Record<string, number[]>;

function clampInt(v: unknown, fallback: number, lo: number, hi: number): number {
  const n = Number(v);
  const k = Number.isFinite(n) ? Math.trunc(n) : fallback;
  return Math.max(lo, Math.min(hi, k));
}

// ---- supertrend (kiwoom-desk port) ----
interface StState { atr: number; finalUpper: number; finalLower: number; value: number; up: boolean; }

function trueRange(bars: readonly Bar[], index: number): number {
  const bar = bars[index];
  if (index === 0) return bar.high - bar.low;
  const prevClose = bars[index - 1].close;
  return Math.max(bar.high - bar.low, Math.abs(bar.high - prevClose), Math.abs(bar.low - prevClose));
}

function seedAtr(bars: readonly Bar[], period: number): number {
  let sum = 0;
  for (let i = 0; i < period; i++) sum += trueRange(bars, i);
  return sum / period;
}

function stState(index: number, bars: readonly Bar[], states: readonly (StState | null)[], period: number, multiplier: number): StState | null {
  if (index < period - 1) return null;
  const bar = bars[index];
  const hl2 = (bar.high + bar.low) / 2;
  const prev = index > 0 ? states[index - 1] : null;
  const atr = index === period - 1
    ? seedAtr(bars, period)
    : prev
      ? ((prev.atr * (period - 1)) + trueRange(bars, index)) / period
      : trueRange(bars, index);
  const basicUpper = hl2 + multiplier * atr;
  const basicLower = hl2 - multiplier * atr;
  if (!prev) {
    const up = bar.close >= hl2;
    return { atr, finalUpper: basicUpper, finalLower: basicLower, value: up ? basicLower : basicUpper, up };
  }
  const prevClose = bars[index - 1].close;
  const finalUpper = basicUpper < prev.finalUpper || prevClose > prev.finalUpper ? basicUpper : prev.finalUpper;
  const finalLower = basicLower > prev.finalLower || prevClose < prev.finalLower ? basicLower : prev.finalLower;
  const wasUpper = prev.value === prev.finalUpper;
  const value = wasUpper
    ? (bar.close <= finalUpper ? finalUpper : finalLower)
    : (bar.close >= finalLower ? finalLower : finalUpper);
  return { atr, finalUpper, finalLower, value, up: value === finalLower };
}

export function supertrend(bars: readonly Bar[], periodIn: number, multIn: number): Series {
  const period = Math.max(1, Math.trunc(Number(periodIn) || 14));
  const mult = Math.max(0.01, Number(multIn) || 2);
  const states: (StState | null)[] = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) states[i] = stState(i, bars, states, period, mult);
  return {
    dir: states.map((s) => (s ? (s.up ? 1 : -1) : NaN)),
    line: states.map((s) => (s ? s.value : NaN)),
  };
}

// ---- jma (kiwoom-desk port) ----
function roundToEven(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const fraction = scaled - floor;
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4;
  let rounded: number;
  if (Math.abs(fraction - 0.5) <= epsilon) rounded = floor % 2 === 0 ? floor : floor + 1;
  else rounded = Math.round(scaled);
  return rounded / factor;
}

export function jma(bars: readonly Bar[], periodIn: number, phaseIn: number, powerIn: number): Series {
  const period = clampInt(periodIn, 14, 1, 10000);
  const phase = clampInt(phaseIn, 50, -100, 100);
  const power = clampInt(powerIn, 2, 1, 10000);
  const beta = 0.45 * (period - 1) / (0.45 * (period - 1) + 2);
  const alpha = beta ** power;
  let e0 = 0, e1 = 0, e2 = 0, last = 0, warm = 0, count = 0, init = false;
  const out: number[] = [];
  for (const bar of bars) {
    const src = bar.close;
    if (!init) { e0 = src; e1 = 0; e2 = 0; last = src; init = true; }
    e0 = (1 - alpha) * src + alpha * e0;
    e1 = (src - e0) * (1 - beta) + beta * e1;
    e2 = (e0 + (phase / 100 + 1.5) * e1 - last) * ((1 - alpha) ** 2) + (alpha ** 2) * e2;
    count++;
    warm += src;
    const cur = count <= period ? roundToEven(warm / count, 4) : roundToEven(e2 + last, 4);
    last = cur;
    out.push(cur);
  }
  return { '': out };
}

// ---- lab-defined (not parity-checked against kiwoom-desk yet) ----
export function momentum(bars: readonly Bar[], nIn: number): Series {
  const n = clampInt(nIn, 80, 1, 100000);
  return { '': bars.map((b, i) => (i >= n && bars[i - n].close ? (b.close / bars[i - n].close) * 100 : NaN)) };
}

export function sma(bars: readonly Bar[], nIn: number): Series {
  const n = clampInt(nIn, 20, 1, 100000);
  const out: number[] = [];
  let sum = 0;
  bars.forEach((b, i) => {
    sum += b.close;
    if (i >= n) sum -= bars[i - n].close;
    out.push(i >= n - 1 ? sum / n : NaN);
  });
  return { '': out };
}

export function ema(bars: readonly Bar[], nIn: number): Series {
  const n = clampInt(nIn, 20, 1, 100000);
  const k = 2 / (n + 1);
  const out: number[] = [];
  let e = NaN;
  bars.forEach((b, i) => {
    e = i === 0 ? b.close : b.close * k + e * (1 - k);
    out.push(i >= n - 1 ? e : NaN);
  });
  return { '': out };
}

export const INDICATORS: Record<string, { fields: string[]; calc: (bars: readonly Bar[], a: number[]) => Series; origin: string }> = {
  supertrend: { fields: ['dir', 'line'], calc: (b, a) => supertrend(b, a[0], a[1]), origin: 'kiwoom-desk port' },
  jma: { fields: [''], calc: (b, a) => jma(b, a[0], a[1], a[2]), origin: 'kiwoom-desk port' },
  momentum: { fields: [''], calc: (b, a) => momentum(b, a[0]), origin: 'lab: close / ref(close, n) * 100' },
  sma: { fields: [''], calc: (b, a) => sma(b, a[0]), origin: 'lab' },
  ema: { fields: [''], calc: (b, a) => ema(b, a[0]), origin: 'lab' },
};
