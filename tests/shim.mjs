// Browser globals for the Node test runner.
//
// Every non-3D module in js/ imports cleanly in Node already: the DOM touches
// are inside functions, not at module top level. This file supplies just those
// call-time globals, and no more. It is loaded with `node --test --import` so
// it is installed before any module under test evaluates.
//
// The canvas context is a *recorder*, not a fake renderer. Asserting on pixels
// would be brittle and would test the browser; asserting on the draw calls
// tests what this repo actually decides: which text lands in the PNG legend,
// in what order, at what size.

function makeStorage() {
  const map = new Map();
  return {
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: k => { map.delete(String(k)); },
    clear: () => map.clear(),
    _map: map
  };
}

// Records every draw call so tests can assert on content, not pixels.
export function recordingContext() {
  const calls = [];
  const push = (op, args) => calls.push({ op, args });
  const ctx = {
    calls,
    canvas: null,
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    filter: 'none',
    globalCompositeOperation: 'source-over',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    // Width proportional to the string, so wrap() produces a plausible line
    // count without pretending to know real font metrics.
    measureText(text) {
      const px = parseFloat(String(ctx.font).match(/(\d+(?:\.\d+)?)px/)?.[1] || '13');
      return { width: String(text).length * px * 0.52 };
    },
    fillText(text, x, y) { push('fillText', [String(text), x, y]); },
    strokeText(text, x, y) { push('strokeText', [String(text), x, y]); },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    drawImage(...a) { push('drawImage', a); },
    save() { push('save', []); },
    restore() { push('restore', []); },
    translate(...a) { push('translate', a); },
    clearRect(...a) { push('clearRect', a); },
    fillRect(...a) { push('fillRect', a); },
    beginPath() { push('beginPath', []); },
    closePath() { push('closePath', []); },
    moveTo(...a) { push('moveTo', a); },
    lineTo(...a) { push('lineTo', a); },
    arc(...a) { push('arc', a); },
    fill() { push('fill', []); },
    stroke() { push('stroke', []); },
    // Everything the recorder returns is text, so these can answer honestly.
    text() { return calls.filter(c => c.op === 'fillText').map(c => c.args[0]); }
  };
  return ctx;
}

function makeCanvas() {
  const ctx = recordingContext();
  const canvas = {
    tagName: 'CANVAS',
    width: 300,
    height: 150,
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,SHIMMED',
    _ctx: ctx
  };
  ctx.canvas = canvas;
  return canvas;
}

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach(x => set.add(x)),
    remove: (...c) => c.forEach(x => set.delete(x)),
    contains: c => set.has(c),
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : Boolean(force);
      if (on) set.add(c); else set.delete(c);
      return on;
    },
    _set: set
  };
}

// Anchor stub: records the download the code tried to start, so exports can be
// tested without a real navigation.
export const downloads = [];

function makeElement(tag) {
  if (tag === 'canvas') return makeCanvas();
  const el = {
    tagName: String(tag).toUpperCase(),
    href: '',
    download: '',
    style: {},
    classList: makeClassList(),
    click() { downloads.push({ href: el.href, download: el.download }); }
  };
  return el;
}

// Install unconditionally, and say why: Node >= 22 already defines
// globalThis.localStorage, but it is inert without --localstorage-file
// ("localStorage.setItem is not a function"). A `if (!globalThis.localStorage)`
// guard therefore skips installing the working one and every storage test
// silently exercises a stub. defineProperty because the built-in is a getter.
Object.defineProperty(globalThis, 'localStorage', {
  value: makeStorage(), writable: true, configurable: true
});
if (!globalThis.document) {
  globalThis.document = {
    body: { classList: makeClassList() },
    createElement: makeElement,
    querySelector: () => null,
    querySelectorAll: () => []
  };
}
if (!globalThis.Blob) {
  globalThis.Blob = class Blob {
    constructor(parts) { this.parts = parts; }
  };
}
if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:shim';
  globalThis.URL.revokeObjectURL = () => {};
}

// A fresh, empty world between tests. Anything that leaks state across files is
// a bug in the test, not something to work around.
export function resetShim() {
  globalThis.localStorage.clear();
  globalThis.document.body.classList._set.clear();
  downloads.length = 0;
}

// Proof the shim is the one installed, not Node's inert built-in. Called at
// import time so a test file can never quietly run against the stub.
try {
  globalThis.localStorage.setItem('__shim_probe__', '1');
  if (globalThis.localStorage.getItem('__shim_probe__') !== '1') throw new Error('read-back failed');
  globalThis.localStorage.removeItem('__shim_probe__');
} catch (err) {
  throw new Error(`tests/shim.mjs: localStorage is not usable (${err.message}). ` +
    'Node ships an inert built-in; the shim must overwrite it, not defer to it.');
}
