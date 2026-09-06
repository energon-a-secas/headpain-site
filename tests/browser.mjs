// Integration tests that need a real browser.
//
// The Node suite covers every pure module. These cover what it structurally
// cannot: WebGL, the boot path, DOM layout and overlap, the iframe embed and its
// postMessage contract. Both of the defects this project shipped and then fixed
// (an episode with no camera reported as an unsupported browser; the mobile
// toolbar buried under a z-index-200 header) were invisible to unit tests and
// are pinned here.
//
// Open tests/browser.html over HTTP. Results land in window.__results too, so an
// agent or a script can read them without looking at the page.

const results = [];
let currentGroup = 'general';

export function group(name) { currentGroup = name; }

export async function it(name, fn) {
  const started = performance.now();
  try {
    await fn();
    results.push({ group: currentGroup, name, ok: true, ms: performance.now() - started });
  } catch (err) {
    results.push({ group: currentGroup, name, ok: false, ms: performance.now() - started, error: String(err && err.message || err) });
  }
  render();
}

export const assert = {
  ok(value, msg) { if (!value) throw new Error(msg || `expected truthy, got ${value}`); },
  equal(a, b, msg) { if (a !== b) throw new Error(msg || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); },
  notEqual(a, b, msg) { if (a === b) throw new Error(msg || `expected something other than ${JSON.stringify(a)}`); },
  gt(a, b, msg) { if (!(a > b)) throw new Error(msg || `expected ${a} > ${b}`); },
  match(str, re, msg) { if (!re.test(String(str))) throw new Error(msg || `${JSON.stringify(String(str))} does not match ${re}`); },
  includes(hay, needle, msg) {
    if (!String(hay).includes(needle)) throw new Error(msg || `expected to find ${JSON.stringify(needle)}`);
  },
};

export const wait = ms => new Promise(r => setTimeout(r, ms));

// Poll instead of sleeping a guessed duration: the 3D model load is not a fixed cost.
export async function until(predicate, { timeout = 15000, label = 'condition' } = {}) {
  const deadline = performance.now() + timeout;
  for (;;) {
    let value;
    try { value = await predicate(); } catch { value = false; }
    if (value) return value;
    if (performance.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await wait(120);
  }
}

// Boot a page in an iframe and hand back its window, plus anything its console
// shouted. Console errors are a first-class assertion here: "it rendered" is
// not the same as "it worked".
export async function boot(src, { width = 1200, height = 800 } = {}) {
  const frame = document.createElement('iframe');
  frame.style.cssText = `width:${width}px;height:${height}px;border:0;position:absolute;left:-4000px;top:0`;
  frame.src = src;
  document.body.appendChild(frame);
  await new Promise(res => { frame.onload = res; });
  const win = frame.contentWindow;
  const errors = [];
  const origError = win.console.error;
  win.console.error = (...a) => { errors.push(a.map(String).join(' ')); origError.apply(win.console, a); };
  win.addEventListener('error', e => errors.push(`uncaught: ${e.message}`));
  win.addEventListener('unhandledrejection', e => errors.push(`unhandled: ${e.reason}`));
  return { frame, win, doc: win.document, errors, destroy: () => frame.remove() };
}

function render() {
  const el = document.getElementById('out');
  if (!el) return;
  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  const byGroup = {};
  for (const r of results) (byGroup[r.group] ||= []).push(r);
  el.innerHTML =
    `<div class="tally ${fail ? 'bad' : 'good'}">${pass} passing · ${fail} failing</div>` +
    Object.entries(byGroup).map(([g, rows]) => `
      <h2>${g}</h2>
      <table>${rows.map(r => `
        <tr class="${r.ok ? 'ok' : 'no'}">
          <td class="mark">${r.ok ? '✔' : '✖'}</td>
          <td>${r.name}${r.error ? `<div class="err">${r.error.replace(/</g, '&lt;')}</div>` : ''}</td>
          <td class="ms">${r.ms.toFixed(0)}ms</td>
        </tr>`).join('')}</table>`).join('');
  window.__results = { pass, fail, results };
}

export function finish() {
  render();
  const fail = results.filter(r => !r.ok);
  window.__done = true;
  window.__results = { pass: results.length - fail.length, fail: fail.length, results };
  document.title = fail.length ? `FAIL (${fail.length}) HeadPain browser tests` : 'PASS HeadPain browser tests';
}
