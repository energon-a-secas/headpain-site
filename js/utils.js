// Generic helpers come from the DOM Kit (js/neorgon-dom.js, vendored from
// packages/neorgon-ui/dom/). They are re-exported so every existing
// `import { escHtml } from './utils.js'` keeps working.
//
// Do not edit js/neorgon-dom.js. Edit the canonical source and run
// packages/neorgon-ui/sync-dom.sh.
import { escHtml, debounce } from './neorgon-dom.js';
export { escHtml, debounce };

export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export const lerp = (a, b, t) => a + (b - a) * t;



export function intensityRGB(value) {
  // 0 = grey; 1-2 light pink; 3-5 red; 6-8 crimson; 9-10 deep crimson
  if (value <= 0) return [200, 200, 200];
  const ramp = [
    { v: 1, c: [255, 204, 204] },
    { v: 3, c: [255, 102, 102] },
    { v: 6, c: [204, 0, 0] },
    { v: 9, c: [128, 0, 0] },
    { v: 10, c: [90, 0, 0] }
  ];
  let lower = ramp[0];
  let upper = ramp[ramp.length - 1];
  for (let i = 0; i < ramp.length - 1; i++) {
    if (value >= ramp[i].v && value <= ramp[i + 1].v) {
      lower = ramp[i];
      upper = ramp[i + 1];
      break;
    }
  }
  const t = value === lower.v ? 0 : (value - lower.v) / (upper.v - lower.v);
  return [
    Math.round(lerp(lower.c[0], upper.c[0], t)),
    Math.round(lerp(lower.c[1], upper.c[1], t)),
    Math.round(lerp(lower.c[2], upper.c[2], t))
  ];
}

export function intensityColor(value) {
  if (value <= 0) return 'rgba(200,200,200,0.2)';
  const [r, g, b] = intensityRGB(value);
  return `rgb(${r}, ${g}, ${b})`;
}

export function intensityLabel(value) {
  if (value === 0) return 'None';
  if (value <= 3) return 'Mild';
  if (value <= 6) return 'Moderate';
  if (value <= 8) return 'Severe';
  return 'Very severe';
}

export function depthLabel(depth) {
  return { surface: 'Surface', deep: 'Deep', internal: 'Internal' }[depth] || depth;
}

export function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

export function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecode(str) {
  const pad = str.length % 4;
  if (pad) str += '='.repeat(4 - pad);
  return atob(str.replace(/\-/g, '+').replace(/_/g, '/'));
}
