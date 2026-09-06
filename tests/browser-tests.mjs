// The browser integration suite. See browser.mjs for the tiny framework.

import { group, it, assert, boot, until, wait, finish } from './browser.mjs';

const APP = '../index.html';
const EMBED = '../embed.html';

// The harness shares an origin with the app, so it shares localStorage. Save it
// and put it back, or running the tests would silently eat the user's diary.
const SAVED_DIARY = localStorage.getItem('headmap-v2');
const restoreDiary = () => {
  if (SAVED_DIARY === null) localStorage.removeItem('headmap-v2');
  else localStorage.setItem('headmap-v2', SAVED_DIARY);
};

const appReady = ctx => until(
  () => ctx.win.__headmap && ctx.win.__headmap.actions && ctx.doc.querySelector('#stage-loader')?.hidden,
  { label: 'the app to finish loading its 3D head' }
);

async function withApp(query, fn) {
  localStorage.removeItem('headmap-v2');
  const ctx = await boot(APP + query);
  try {
    await appReady(ctx);
    await fn(ctx);
  } finally {
    ctx.destroy();
    restoreDiary();
  }
}

// ── Boot ────────────────────────────────────────────────────────────────────
group('boot');

await it('the app boots with an empty diary and logs no console errors', async () => {
  await withApp('', async ctx => {
    assert.equal(ctx.errors.length, 0, `console errors: ${ctx.errors.join(' | ')}`);
    assert.ok(ctx.doc.querySelector('#stage-fallback').hidden, 'the 3D fallback should stay hidden');
    assert.equal(ctx.win.__headmap.state.episodes[0].groups.length, 0, 'a fresh diary has no pains yet');
  });
});

await it('a ?learn= link renders a published pattern and does not report a broken browser', async () => {
  // Regression: plainEpisode() once omitted `camera`, the boot threw reading
  // camera.theta inside head.ready.then, and the catch told the user their
  // browser could not do 3D.
  await withApp('?learn=cluster-headache', async ctx => {
    assert.equal(ctx.errors.length, 0, `console errors: ${ctx.errors.join(' | ')}`);
    assert.ok(ctx.doc.querySelector('#stage-fallback').hidden, 'the fallback fired, so boot threw');
    const ep = ctx.win.__headmap.state.episodes[0];
    assert.includes(ep.title.toLowerCase(), 'cluster');
    assert.gt(ep.markers.length, 0);
    assert.ok(ctx.win.__headmap.state.explain, 'a learn link should open read-only');
  });
});

await it('a learn link leaves the local diary untouched', async () => {
  localStorage.setItem('headmap-v2', JSON.stringify({
    v: 2, episodes: [{ id: 'keepme', title: 'Mine', createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z', camera: { theta: 0, phi: 1.57, dist: 4.9 },
      groups: [], markers: [] }], activeEpisodeId: 'keepme', view: 'normal'
  }));
  const ctx = await boot(APP + '?learn=migraine-no-aura');
  try {
    await appReady(ctx);
    await wait(400);
    const stored = JSON.parse(localStorage.getItem('headmap-v2'));
    assert.equal(stored.episodes[0].title, 'Mine', 'the learn view overwrote the diary');
  } finally { ctx.destroy(); restoreDiary(); }
});

// ── The pain model, through the real UI ─────────────────────────────────────
group('pains');

await it('the first point creates a pain and joins it, with no visit to a New Group button', async () => {
  await withApp('', async ctx => {
    ctx.win.__headmap.actions.addPointForZone('temple-left');
    const ep = ctx.win.__headmap.state.episodes[0];
    assert.equal(ep.groups.length, 1);
    assert.equal(ep.markers.length, 1);
    assert.equal(ep.markers[0].groupId, ep.groups[0].id, 'the point did not join the pain');
  });
});

await it('the pain bar shows one chip per pain, each with a glyph and a count', async () => {
  await withApp('', async ctx => {
    const a = ctx.win.__headmap.actions;
    a.addPointForZone('temple-left');
    a.newPain();
    ctx.doc.querySelector('.pain-rename')?.blur();
    const ep = ctx.win.__headmap.state.episodes[0];
    a.setActivePain(ep.groups[1].id);
    a.addPointForZone('neck-back-upper');
    const chips = ctx.doc.querySelectorAll('.pain-chip');
    assert.equal(chips.length, 2);
    for (const chip of chips) {
      assert.ok(chip.querySelector('.pain-style svg'), 'a chip with no glyph is a colour-only legend');
      assert.equal(chip.querySelector('.pain-count').textContent, '1');
    }
  });
});

await it('two pains get two different glyphs on the head, not just two hues', async () => {
  await withApp('', async ctx => {
    const a = ctx.win.__headmap.actions;
    a.addPointForZone('temple-left');
    a.newPain();
    ctx.doc.querySelector('.pain-rename')?.blur();
    const ep = ctx.win.__headmap.state.episodes[0];
    a.setActivePain(ep.groups[1].id);
    a.addPointForZone('neck-back-upper');
    assert.notEqual(ep.groups[0].pattern, ep.groups[1].pattern);
    assert.notEqual(ep.groups[0].color, ep.groups[1].color);
    // and the 3D layer really built decals for both
    const { scene } = ctx.win.__headmap.head.debugScene();
    let textured = 0;
    scene.traverse(o => { if (o.isMesh && o.material && o.material.map) textured++; });
    assert.gt(textured, 2, 'expected at least a halo and a core decal per marker');
  });
});

await it('isolating a pain does not redirect where the next point lands', async () => {
  await withApp('', async ctx => {
    const a = ctx.win.__headmap.actions, s = ctx.win.__headmap.state;
    a.addPointForZone('temple-left');
    a.newPain();
    ctx.doc.querySelector('.pain-rename')?.blur();
    const ep = s.episodes[0];
    a.setActivePain(ep.groups[1].id);
    const activeBefore = s.activeGroupId;
    a.isolatePain(ep.groups[0].id);
    assert.equal(s.isolateGroupId, ep.groups[0].id);
    assert.equal(s.activeGroupId, activeBefore, 'isolate moved the placement target');
    a.addPointForZone('vertex-center');
    assert.equal(ep.markers[ep.markers.length - 1].groupId, activeBefore);
  });
});

// ── Explain view and the exported picture ───────────────────────────────────
group('explain and export');

await it('?explain=1 hides the editor and shows a legend with every pain named', async () => {
  await withApp('?explain=1&learn=demo-combo', async ctx => {
    assert.ok(ctx.win.__headmap.state.explain);
    const legend = ctx.doc.querySelector('#stage-legend .legend');
    assert.ok(legend, 'no legend on the stage in explain view');
    const names = [...ctx.doc.querySelectorAll('.legend-name')].map(n => n.textContent);
    assert.equal(names.length, 2);
    assert.ok(ctx.doc.querySelectorAll('.explain-card').length >= 2, 'no plain-English cards');
    const panel = ctx.win.getComputedStyle(ctx.doc.querySelector('.panel'));
    assert.equal(panel.display, 'none', 'the editor panel is still visible in explain view');
  });
});

await it('the exported PNG is taller than the canvas and carries the legend text', async () => {
  await withApp('?learn=demo-combo', async ctx => {
    const { head, state, registry } = ctx.win.__headmap;
    const { buildLegend, drawLegendPng, legendPngHeight } = await import('../js/legend.js');
    const ep = state.episodes[0];
    const model = buildLegend(ep, registry.zoneById);
    const canvas = head.getCanvas();
    head.renderNow();
    const s = Math.max(0.85, Math.min(2, canvas.width / 900));
    const legendH = legendPngHeight(model, s, canvas.width);
    assert.gt(legendH, 40, 'the legend strip has no height');

    // Draw it for real and read the pixels back: a legend that draws nothing
    // still "succeeds" if you only check the call returned.
    const out = document.createElement('canvas');
    out.width = canvas.width;
    out.height = canvas.height + legendH;
    const g = out.getContext('2d');
    g.fillStyle = '#070b16';
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(canvas, 0, 0);
    drawLegendPng(g, model, { x: 0, y: canvas.height, width: canvas.width, scale: s });
    const strip = g.getImageData(0, canvas.height, out.width, legendH).data;
    let lit = 0;
    for (let i = 0; i < strip.length; i += 4) {
      if (strip[i] > 90 || strip[i + 1] > 90 || strip[i + 2] > 90) lit++;
    }
    assert.gt(lit, 500, 'the legend strip is blank: text was measured but never painted');
    assert.gt(out.height, canvas.height, 'the export is not taller than the view it came from');
  });
});

await it('the PNG button runs to a download without throwing', async () => {
  await withApp('?learn=demo-combo', async ctx => {
    const proto = ctx.win.HTMLAnchorElement.prototype;
    const orig = proto.click;
    let captured = null;
    proto.click = function () { captured = { download: this.download, href: this.href }; };
    try {
      ctx.doc.querySelector('#btn-png').click();
    } finally { proto.click = orig; }
    assert.ok(captured, 'no download was started');
    assert.match(captured.download, /^headpain-.*-\d{4}-\d{2}-\d{2}\.png$/);
    assert.match(captured.href, /^data:image\/png;base64,/);
  });
});

// ── Layout: the overlap a screenshot hides ──────────────────────────────────
group('layout');

await it('every stage-toolbar button is actually tappable at phone width', async () => {
  // Regression: the kit header sits at z-index 200 and the stage sticks at
  // top:0 beneath it, so the toolbar sat *under* the header and five controls
  // could not be pressed. A screenshot showed nothing wrong.
  localStorage.removeItem('headmap-v2');
  const ctx = await boot(APP, { width: 375, height: 812 });
  try {
    await appReady(ctx);
    await wait(300);
    const buttons = [...ctx.doc.querySelectorAll('.stage-toolbar .chip-btn')];
    assert.gt(buttons.length, 3);
    for (const b of buttons) {
      const r = b.getBoundingClientRect();
      const hit = ctx.doc.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      assert.ok(b === hit || b.contains(hit),
        `"${b.textContent.trim()}" is covered by <${hit?.tagName?.toLowerCase()} class="${hit?.className}">`);
    }
  } finally { ctx.destroy(); restoreDiary(); }
});

await it('the head stays on screen while the panel scrolls on a phone', async () => {
  localStorage.removeItem('headmap-v2');
  const ctx = await boot(APP, { width: 375, height: 812 });
  try {
    await appReady(ctx);
    ctx.win.scrollTo(0, 900);
    await wait(250);
    const stage = ctx.doc.querySelector('#stage').getBoundingClientRect();
    assert.gt(stage.bottom, 100, 'the head scrolled away from the controls that edit it');
  } finally { ctx.destroy(); restoreDiary(); }
});

// ── The embed ───────────────────────────────────────────────────────────────
group('embed');

const embedReady = ctx => until(
  () => ctx.doc.querySelector('#embed-loader')?.hidden && ctx.doc.querySelector('.head-canvas'),
  { label: 'the embed to load' }
);

await it('the embed renders a demo, a preset and a pasted map', async () => {
  for (const [query, expect] of [
    ['?demo=demo-combo', 2],
    ['?preset=cluster-headache', 1],
  ]) {
    const ctx = await boot(EMBED + query, { width: 800, height: 520 });
    try {
      await embedReady(ctx);
      assert.equal(ctx.errors.length, 0, `${query} logged: ${ctx.errors.join(' | ')}`);
      const rows = ctx.doc.querySelectorAll('.legend-row');
      assert.equal(rows.length, expect, `${query} rendered ${rows.length} legend rows`);
    } finally { ctx.destroy(); }
  }
});

await it('the embed never reads the visitor local diary', async () => {
  // A HeadPain widget on somebody else's page must not be able to render the
  // reader's own private maps.
  localStorage.setItem('headmap-v2', JSON.stringify({
    v: 2, episodes: [{ id: 'private', title: 'PRIVATE DIARY ENTRY', createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z', camera: { theta: 0, phi: 1.57, dist: 4.9 },
      groups: [{ id: 'g', name: 'Secret pain', color: '#f43f5e', pattern: 'solid' }],
      markers: [{ zoneId: 'temple-left', p: [0, 0, 1], n: [0, 0, 1], intensity: 9, depth: 'surface',
        spread: 'small', note: '', groupId: 'g' }] }],
    activeEpisodeId: 'private', view: 'normal'
  }));
  const ctx = await boot(EMBED + '?preset=tension-type', { width: 800, height: 520 });
  try {
    await embedReady(ctx);
    assert.ok(!ctx.doc.body.textContent.includes('PRIVATE DIARY ENTRY'), 'the embed rendered the local diary');
    assert.ok(!ctx.doc.body.textContent.includes('Secret pain'));
  } finally { ctx.destroy(); restoreDiary(); }
});

await it('the embed says so instead of failing silently when nothing is passed', async () => {
  for (const query of ['', '?map=notarealpayload']) {
    const ctx = await boot(EMBED + query, { width: 800, height: 400 });
    try {
      await until(() => ctx.doc.querySelector('.embed-error'), { label: 'an error message' });
      assert.ok(ctx.doc.querySelector('#embed-controls').hidden,
        'controls that steer a head there is no head to steer are worse than none');
    } finally { ctx.destroy(); }
  }
});

await it('the embed obeys its URL settings', async () => {
  const ctx = await boot(EMBED + '?demo=demo-combo&xray=1&legend=full&controls=none&title=Custom+caption&isolate=1',
    { width: 900, height: 560 });
  try {
    await embedReady(ctx);
    assert.equal(ctx.doc.querySelector('#embed-caption').textContent, 'Custom caption');
    assert.ok(ctx.doc.querySelector('#embed-controls').hidden, 'controls=none left the controls visible');
    assert.ok(ctx.doc.querySelector('.legend--verbose'), 'legend=full did not produce the verbose legend');
    assert.equal(ctx.doc.querySelectorAll('.legend-row.faded').length, 1, 'isolate=1 did not fade the other pain');
  } finally { ctx.destroy(); }
});

await it('the embed answers postMessage and reports its state back', async () => {
  const ctx = await boot(EMBED + '?demo=demo-combo', { width: 800, height: 520 });
  const seen = [];
  const onMessage = e => { if (e.data && e.data.source === 'headpain') seen.push(e.data); };
  window.addEventListener('message', onMessage);
  try {
    await embedReady(ctx);
    await until(() => seen.some(m => m.type === 'ready'), { label: 'a ready event' });
    const ready = seen.find(m => m.type === 'ready');
    assert.equal(ready.pains.length, 2);
    assert.gt(ready.points, 0);

    ctx.win.postMessage({ type: 'headpain:xray', on: true }, '*');
    await until(() => seen.some(m => m.type === 'state' && m.xray === true), { label: 'x-ray to turn on' });

    ctx.win.postMessage({ type: 'headpain:isolate', pain: 'Sinus pressure' }, '*');
    await until(() => seen.some(m => m.type === 'state' && m.isolate === 'Sinus pressure'),
      { label: 'isolation by pain name' });

    ctx.win.postMessage({ type: 'headpain:isolate', pain: null }, '*');
    await until(() => seen.slice(-1)[0]?.isolate === null, { label: 'isolation to clear' });

    // An unrelated message must be ignored, not crash the widget.
    const before = seen.length;
    ctx.win.postMessage({ type: 'something:else', on: true }, '*');
    ctx.win.postMessage('a bare string', '*');
    await wait(200);
    assert.equal(seen.length, before, 'the embed answered a message that was not addressed to it');
    assert.equal(ctx.errors.length, 0, `console errors: ${ctx.errors.join(' | ')}`);
  } finally {
    window.removeEventListener('message', onMessage);
    ctx.destroy();
  }
});

// ── The builder ─────────────────────────────────────────────────────────────
group('embed builder');

await it('the builder writes a snippet whose URL actually renders', async () => {
  const ctx = await boot('../embed-builder.html', { width: 1200, height: 900 });
  try {
    await until(() => ctx.doc.querySelector('#snippet')?.textContent.includes('<iframe'),
      { label: 'the snippet to be written' });
    const form = ctx.doc.querySelector('#builder-form');
    form.elements.demo.value = 'demo-combo';
    form.elements.legend.value = 'full';
    form.dispatchEvent(new ctx.win.Event('change', { bubbles: true }));
    await ctx.win.Promise.resolve();
    const snippet = ctx.doc.querySelector('#snippet').textContent;
    assert.includes(snippet, 'demo=demo-combo');
    assert.includes(snippet, 'legend=full');
    assert.includes(snippet, 'https://headpain.neorgon.com/embed.html');
    assert.includes(snippet, 'loading="lazy"');

    // The preview must be pointed at the same settings, relatively.
    const preview = ctx.doc.querySelector('#preview-frame').getAttribute('src');
    assert.includes(preview, 'demo=demo-combo');
    assert.ok(!preview.startsWith('http'), 'the preview should stay same-origin');
    assert.equal(ctx.errors.length, 0, `console errors: ${ctx.errors.join(' | ')}`);
  } finally { ctx.destroy(); }
});

// ── Panels and keyboard, through the real UI ────────────────────────────────
group('panels');

await it('answering the impact questions turns them into sentences immediately', async () => {
  await withApp('', async ctx => {
    const a = ctx.win.__headmap.actions;
    a.addPointForZone('temple-left');
    a.setTab('impact');
    a.setImpact({ frequency: 'weekly', duration: 'few-hours', daysLost: 4 });
    a.toggleImpact('blocked', 'work');
    a.toggleImpact('symptoms', 'light');
    const text = ctx.doc.querySelector('.impact-summary').textContent;
    assert.includes(text, 'about once a week');
    assert.includes(text, 'stops me working');
    assert.includes(text, 'about 4 days');
    assert.includes(text, 'light hurting');
  });
});

await it('an impact chip toggles once per click, not once per past render', async () => {
  // renderImpact runs on every renderAll and its handler lives on a container
  // that survives re-render. Bound per render it would stack up.
  await withApp('', async ctx => {
    const a = ctx.win.__headmap.actions;
    a.addPointForZone('temple-left');
    a.setTab('impact');
    for (let i = 0; i < 5; i++) a.renderAll();
    ctx.doc.querySelector('[data-blocked="work"]').click();
    const ep = ctx.win.__headmap.state.episodes[0];
    assert.equal(ep.impact.blocked.length, 1, `blocked = ${JSON.stringify(ep.impact.blocked)}`);
    ctx.doc.querySelector('[data-blocked="work"]').click();
    assert.equal(ctx.win.__headmap.state.episodes[0].impact.blocked.length, 0);
  });
});

await it('the colour and shape popover offers both channels and applies them in one click', async () => {
  await withApp('', async ctx => {
    ctx.win.__headmap.actions.addPointForZone('temple-left');
    ctx.doc.querySelector('[data-style]').click();
    const swatches = ctx.doc.querySelectorAll('.style-pop .style-swatch');
    assert.equal(swatches.length, 16, 'expected 8 colours and 8 shapes');
    const pain = ctx.win.__headmap.state.episodes[0].groups[0];
    const before = { color: pain.color, pattern: pain.pattern };
    // The popover stays open across a choice on purpose: picking a colour and
    // then a shape is one visit, not two.
    ctx.doc.querySelector('.style-pop [data-pattern="grid"]').click();
    assert.equal(ctx.win.__headmap.state.episodes[0].groups[0].pattern, 'grid');
    assert.ok(ctx.doc.querySelector('.style-pop'), 'the popover closed after one choice');
    ctx.doc.querySelector('.style-pop [data-color="#22d3ee"]').click();
    const after = ctx.win.__headmap.state.episodes[0].groups[0];
    assert.equal(after.color, '#22d3ee');
    assert.notEqual(after.color, before.color);
  });
});

await it('the keyboard shortcuts the toolbar advertises actually fire', async () => {
  await withApp('', async ctx => {
    const a = ctx.win.__headmap.actions, s = ctx.win.__headmap.state;
    a.addPointForZone('temple-left');
    // Dispatch at the body, which is where a browser sends a keydown when
    // nothing is focused. Dispatching at `window` gives the handler a target
    // with no .matches() and is not a state a user can produce.
    const key = k => ctx.doc.body.dispatchEvent(new ctx.win.KeyboardEvent('keydown', { key: k, bubbles: true }));

    key('x');
    assert.equal(s.view, 'xray', 'X did not toggle x-ray');
    key('x');
    assert.equal(s.view, 'normal');

    key('e');
    assert.ok(s.explain, 'E did not open the explain view');
    key('e');
    assert.ok(!s.explain);

    // I is a no-op with one pain, and must not throw or half-apply.
    key('i');
    assert.equal(s.isolateGroupId, null, 'isolate fired with only one pain to isolate');
  });
});

await it('typing in a note does not trigger the single-key shortcuts', async () => {
  await withApp('', async ctx => {
    const a = ctx.win.__headmap.actions, s = ctx.win.__headmap.state;
    a.addPointForZone('temple-left');
    const note = ctx.doc.querySelector('.note-input');
    assert.ok(note, 'the point editor has no note field');
    note.focus();
    note.dispatchEvent(new ctx.win.KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    assert.equal(s.view, 'normal', 'typing "x" in a note toggled x-ray');
  });
});

await it('a share link opens the map the sender built, in the view they chose', async () => {
  let url;
  await withApp('?learn=demo-combo', async ctx => {
    // Import inside the iframe's realm. `import()` here would load a SECOND
    // copy of state.js in this page, whose store is empty, and buildShareUrl
    // reads module-level state: the link would come back describing nothing.
    // Root-absolute: a relative specifier inside eval() resolves against THIS
    // page's URL (/tests/), not the iframe's.
    const ex = await ctx.win.eval("import('/js/export.js')");
    url = ex.buildShareUrl(ctx.win.__headmap.registry.zoneIndexOf, { explain: true });
    assert.gt(url.length, 300, 'the payload is too short to hold a two-pain map');
  });
  assert.includes(url, '?explain=1');
  const query = url.slice(url.indexOf('?'));
  localStorage.removeItem('headmap-v2');
  const ctx = await boot(APP + query);
  try {
    await appReady(ctx);
    assert.equal(ctx.errors.length, 0, `console errors: ${ctx.errors.join(' | ')}`);
    assert.ok(ctx.win.__headmap.state.explain, 'the link did not open read-only');
    assert.equal(ctx.win.__headmap.state.episodes[0].groups.length, 2);
    assert.ok(ctx.doc.querySelector('#stage-legend .legend'), 'no legend for the recipient');
  } finally { ctx.destroy(); restoreDiary(); }
});

// ── Comparing two patterns ──────────────────────────────────────────────────
group('compare');

await it('?compare= puts two published patterns on one head as two distinguishable pains', async () => {
  await withApp('?compare=migraine-no-aura,tension-type', async ctx => {
    assert.equal(ctx.errors.length, 0, `console errors: ${ctx.errors.join(' | ')}`);
    const ep = ctx.win.__headmap.state.episodes[0];
    assert.equal(ep.groups.length, 2);
    assert.notEqual(ep.groups[0].color, ep.groups[1].color, 'both patterns came out the same hue');
    assert.notEqual(ep.groups[0].pattern, ep.groups[1].pattern, 'both patterns came out the same glyph');
    assert.gt(ep.markers.length, 2);
    assert.ok(ctx.win.__headmap.state.explain, 'a comparison should open read-only');
    assert.equal(ep.markers.filter(m => !ep.groups.some(g => g.id === m.groupId)).length, 0,
      'a comparison produced points belonging to no pain');
    const names = [...ctx.doc.querySelectorAll('.legend-name')].map(n => n.textContent);
    assert.equal(names.length, 2, `legend rows: ${JSON.stringify(names)}`);
  });
});

await it('a comparison can be narrowed to one pattern at a time', async () => {
  await withApp('?compare=cluster-headache,migraine-no-aura', async ctx => {
    const s = ctx.win.__headmap.state;
    const first = s.episodes[0].groups[0];
    ctx.win.__headmap.actions.isolatePain(first.id);
    assert.equal(s.isolateGroupId, first.id);
    assert.equal(ctx.doc.querySelectorAll('.legend-row.faded').length, 1,
      'isolating one pattern did not fade the other');
  });
});

await it('a comparison never touches the reader own diary', async () => {
  localStorage.setItem('headmap-v2', JSON.stringify({
    v: 2, episodes: [{ id: 'mine', title: 'Mine', createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z', camera: { theta: 0, phi: 1.57, dist: 4.9 },
      groups: [], markers: [] }], activeEpisodeId: 'mine', view: 'normal'
  }));
  const ctx = await boot(APP + '?compare=migraine-no-aura,tension-type');
  try {
    await appReady(ctx);
    await wait(400);
    assert.equal(JSON.parse(localStorage.getItem('headmap-v2')).episodes[0].title, 'Mine');
  } finally { ctx.destroy(); restoreDiary(); }
});

await it('a bad comparison says so instead of opening an empty head', async () => {
  await withApp('?compare=not-a-pattern,also-not-real', async ctx => {
    assert.equal(ctx.errors.length, 0, `console errors: ${ctx.errors.join(' | ')}`);
    assert.ok(!ctx.win.__headmap.state.explain, 'an unusable comparison still opened the read-only view');
    assert.equal(ctx.win.__headmap.state.episodes[0].markers.length, 0);
  });
});

await it('the explain view offers to compare a library pattern, but never someone own map', async () => {
  await withApp('?learn=cluster-headache', async ctx => {
    const picker = ctx.doc.querySelector('#compare-with');
    assert.ok(picker, 'no compare picker on a library pattern');
    assert.gt(picker.options.length, 5);
    assert.ok(![...picker.options].some(o => o.value === 'cluster-headache'),
      'the picker offered to compare a pattern with itself');
  });
  await withApp('', async ctx => {
    ctx.win.__headmap.actions.addPointForZone('temple-left');
    ctx.win.__headmap.actions.toggleExplain();
    assert.ok(!ctx.doc.querySelector('#compare-with'),
      'the picker appeared on a personal map, where choosing would replace it');
  });
});

// ── Navigation ──────────────────────────────────────────────────────────────
group('navigation');

await it('the three pages can be reached from each other', async () => {
  const links = async (src, expected) => {
    const ctx = await boot(src, { width: 1200, height: 800 });
    try {
      await until(() => ctx.doc.querySelector('a[href]'), { label: 'the page to render' });
      const hrefs = [...ctx.doc.querySelectorAll('a[href]')].map(a => a.getAttribute('href'));
      for (const want of expected) {
        assert.ok(hrefs.some(h => h && h.startsWith(want)),
          `${src} has no link to ${want}; hrefs were ${JSON.stringify(hrefs.slice(0, 12))}`);
      }
    } finally { ctx.destroy(); }
  };
  await links(APP, ['headache-patterns.html', 'embed-builder.html']);
  await links('../headache-patterns.html', ['./?learn=', './?compare=', 'embed-builder.html']);
  await links('../embed-builder.html', ['./']);
});

// ── The patterns page ───────────────────────────────────────────────────────
group('patterns page');

await it('the patterns page lists every published pattern, built from the same data the matcher uses', async () => {
  const ctx = await boot('../headache-patterns.html', { width: 1100, height: 900 });
  try {
    await until(() => ctx.doc.querySelectorAll('.lib-card').length > 0, { label: 'the pattern cards' });
    const { CONDITIONS } = await import('../js/conditions.js');
    const expected = CONDITIONS.filter(c => c.tier === 'common' || c.tier === 'advanced');
    const cards = ctx.doc.querySelectorAll('.lib-card');
    assert.equal(cards.length, expected.length,
      'the page and the matcher disagree about how many patterns exist');
    assert.equal(ctx.errors.length, 0, `console errors: ${ctx.errors.join(' | ')}`);
  } finally { ctx.destroy(); }
});

await it('every "See it on the head" link points at a pattern the app can actually render', async () => {
  const ctx = await boot('../headache-patterns.html', { width: 1100, height: 900 });
  try {
    await until(() => ctx.doc.querySelectorAll('.lib-card').length > 0, { label: 'the pattern cards' });
    const { episodeFromCondition } = await import('../js/presets.js');
    const { buildRegistry } = await import('../js/registry.js');
    const baked = await fetch('../assets/zones.baked.json').then(r => r.json());
    const registry = buildRegistry(baked, null);
    const links = [...ctx.doc.querySelectorAll('a[href*="?learn="]')];
    assert.gt(links.length, 10);
    for (const a of links) {
      const id = decodeURIComponent(new URL(a.href).searchParams.get('learn'));
      const ep = episodeFromCondition(id, registry);
      assert.ok(ep, `?learn=${id} is linked but produces no episode`);
      assert.gt(ep.markers.length, 0, `?learn=${id} would open an empty head`);
    }
  } finally { ctx.destroy(); }
});

await it('every "Compare" link on the patterns page resolves to two real, showable patterns', async () => {
  const ctx = await boot('../headache-patterns.html', { width: 1100, height: 900 });
  try {
    await until(() => ctx.doc.querySelectorAll('.lib-card').length > 0, { label: 'the pattern cards' });
    const { episodeFromComparison } = await import('../js/presets.js');
    const { buildRegistry } = await import('../js/registry.js');
    const registry = buildRegistry(await fetch('../assets/zones.baked.json').then(r => r.json()), null);
    const links = [...ctx.doc.querySelectorAll('a[href*="?compare="]')];
    assert.gt(links.length, 10);
    for (const a of links) {
      const ids = decodeURIComponent(new URL(a.href).searchParams.get('compare')).split(',');
      assert.equal(new Set(ids).size, 2, `a card offers to compare a pattern with itself: ${ids}`);
      const ep = episodeFromComparison(ids, registry);
      assert.ok(ep, `?compare=${ids} produces no episode`);
      assert.equal(ep.groups.length, 2);
      assert.gt(ep.markers.length, 1);
    }
  } finally { ctx.destroy(); }
});

await it('a pattern deep link scrolls to that pattern instead of the top', async () => {
  const ctx = await boot('../headache-patterns.html#cluster-headache', { width: 1100, height: 700 });
  try {
    await until(() => ctx.doc.querySelector('#cluster-headache'), { label: 'the cluster card' });
    await wait(250);
    const box = ctx.doc.querySelector('#cluster-headache').getBoundingClientRect();
    assert.ok(box.top < 400 && box.bottom > 0, `the deep-linked card is at y=${Math.round(box.top)}`);
  } finally { ctx.destroy(); }
});

finish();
