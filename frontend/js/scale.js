// Colour scale, number formatting and small statistics. Pure functions, no DOM.

// ColorBrewer "BuPu" (7 classes, colourblind-safe sequential). Chosen to stay distinct from the green NDVI
// overlay and the orange temperature overlay. Low score = pale, high score = deep purple.
export const RAMP = ["#edf8fb", "#bfd3e6", "#9ebcda", "#8c96c6", "#8c6bb1", "#88419d", "#6e016b"];

/** Class 0..n-1 for a value between min and max (values outside are clamped). */
export function classIndex(value, min, max, n = RAMP.length) {
  if (!Number.isFinite(value)) return 0;
  if (!(max > min)) return Math.floor(n / 2);
  const t = (Math.min(Math.max(value, min), max) - min) / (max - min);
  return Math.min(n - 1, Math.floor(t * n));
}

export function colorFor(value, min, max) {
  return RAMP[classIndex(value, min, max)];
}

/** Legend rows: [{from, to, color}] covering min..max. */
export function legendBins(min, max, n = RAMP.length) {
  const step = (max - min) / n;
  return Array.from({ length: n }, (_, i) => ({ from: min + i * step, to: min + (i + 1) * step, color: RAMP[i] }));
}

/** Minimum and maximum of a list of numbers, ignoring non-finite values. */
export function extent(values) {
  const v = values.filter(Number.isFinite);
  return v.length ? [Math.min(...v), Math.max(...v)] : [0, 1];
}

/** Share (0-100) of the values that are strictly below `value`. */
export function percentBelow(values, value) {
  const v = values.filter(Number.isFinite);
  if (!v.length || !Number.isFinite(value)) return null;
  return Math.round((100 * v.filter((x) => x < value).length) / v.length);
}

export const DASH = "–";
export function fmt(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : DASH;
}
export function fmtPct(value, digits = 1) {
  return Number.isFinite(value) ? `${value.toFixed(digits)}%` : DASH;
}
export function fmtC(value, digits = 1) {
  return Number.isFinite(value) ? `${value.toFixed(digits)} °C` : DASH;
}
export function fmtMetres(value) {
  return Number.isFinite(value) ? `${Math.round(value)} m` : DASH;
}
