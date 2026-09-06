// The embed builder — a form that writes the iframe tag.
//
// The param contract is only real if there is somewhere to see it work. A
// documented contract with no builder gets copied wrong once and then avoided;
// this page configures a live preview and hands over the finished snippet.

import { CONDITIONS } from './conditions.js';
import { DEMOS } from './demos.js';
import { $, $$, escHtml } from './utils.js';

const form = $('#builder-form');
const frame = $('#preview-frame');
const snippet = $('#snippet');
const eventLog = $('#event-log');

// Populate the two source pickers from the same data the app uses, so a new
// condition or demo appears here without anyone remembering to add it.
$('#f-demo').innerHTML = DEMOS.map(d => `<option value="${d.id}">${escHtml(d.title)}</option>`).join('');
$('#f-preset').innerHTML = CONDITIONS
  .filter(c => !c.notMappable && c.primary?.length)
  .map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');

const val = name => form.elements[name]?.value.trim() ?? '';
const checked = name => Boolean(form.elements[name]?.checked);

function buildParams() {
  const p = new URLSearchParams();
  const source = val('source');
  if (source === 'demo') p.set('demo', val('demo'));
  else if (source === 'preset') p.set('preset', val('preset'));
  else {
    // A pasted HeadPain link: lift the payload out of its #m= hash.
    const raw = val('map');
    const m = raw.match(/[#&?]m=([A-Za-z0-9_-]+)/) || raw.match(/^([A-Za-z0-9_-]{20,})$/);
    if (m) p.set('map', m[1]);
  }
  if (checked('xray')) p.set('xray', '1');
  if (checked('rotate')) p.set('rotate', 'auto');
  if (val('legend') !== 'compact') p.set('legend', val('legend'));
  if (val('controls') !== 'view') p.set('controls', val('controls'));
  if (val('isolate')) p.set('isolate', val('isolate'));
  if (val('title')) p.set('title', val('title'));
  if (val('bg')) p.set('bg', val('bg').replace('#', ''));
  return p;
}

function embedUrl(absolute) {
  const base = absolute ? 'https://headpain.neorgon.com/embed.html' : 'embed.html';
  const p = buildParams();
  return p.toString() ? `${base}?${p}` : base;
}

function update() {
  const height = val('height') || '460';
  frame.src = embedUrl(false);
  frame.style.height = `${height}px`;
  const title = val('title') || 'HeadPain pain map';
  snippet.textContent =
`<iframe src="${embedUrl(true)}"
        title="${title.replace(/"/g, '&quot;')}"
        width="100%" height="${height}"
        style="border:0;border-radius:12px"
        loading="lazy"></iframe>`;
}

form.addEventListener('input', update);
form.addEventListener('change', () => {
  // Show only the field that belongs to the chosen source.
  const source = val('source');
  $$('[data-source]').forEach(el => { el.hidden = el.dataset.source !== source; });
  update();
});

$('#copy').addEventListener('click', () => {
  navigator.clipboard.writeText(snippet.textContent).then(() => {
    const btn = $('#copy');
    btn.textContent = 'Copied';
    setTimeout(() => { btn.textContent = 'Copy the snippet'; }, 1800);
  });
});

// ── The postMessage API, demonstrated rather than described ─────────────────
function send(message) {
  frame.contentWindow?.postMessage(message, '*');
  log(`sent  ${JSON.stringify(message)}`);
}

function log(line) {
  const time = new Date().toLocaleTimeString();
  eventLog.textContent = `${time}  ${line}\n${eventLog.textContent}`.split('\n').slice(0, 12).join('\n');
}

$('#api-buttons').addEventListener('click', e => {
  const btn = e.target.closest('[data-send]');
  if (btn) send(JSON.parse(btn.dataset.send));
});

window.addEventListener('message', e => {
  if (e.data?.source !== 'headpain') return;
  log(`recv  ${JSON.stringify(e.data)}`);
});

$$('[data-source]').forEach(el => { el.hidden = el.dataset.source !== 'demo'; });
update();
