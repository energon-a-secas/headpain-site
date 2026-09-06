// The legend: one model, two renderers, and the only thing that makes a map
// readable by someone who did not place the points. This file pins the model
// buildLegend hands to both renderers, the prose it speaks (plain phrasings,
// merged left/right pairs, an honest "and N more"), the swatch that carries a
// pain's identity on two channels at once, the escaping the DOM renderer owes a
// name that arrived from a share link, and the text *and geometry* of the PNG,
// because the picture is the only copy the doctor gets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordingContext } from './shim.mjs';
import { registry } from './fixtures.mjs';
import { buildLegend, legendHtml, legendPngHeight, drawLegendPng } from '../js/legend.js';
import { defaultEpisode, defaultGroup, defaultMarker } from '../js/state.js';
import { normalizeImpact, BLOCKED } from '../js/impact.js';
import { QUALITIES, DEPTHS } from '../js/zones.js';
import { paint } from '../js/groups.js';
import { patternSvg } from '../js/patterns.js';

const zoneById = registry.zoneById;

// An episode in the shape state.js actually stores: real groups, real markers,
// real (baked) zone ids. Invented zone ids resolve to null and quietly turn the
// whole "where" clause into "across the head".
function episodeOf(pains, { title = 'Tuesday migraine', impact = null } = {}) {
  const groups = [];
  const markers = [];
  for (const p of pains) {
    const g = defaultGroup(
      { name: p.name, color: p.color, pattern: p.pattern, conditionId: p.conditionId },
      groups
    );
    groups.push(g);
    for (const m of p.markers || []) markers.push(defaultMarker({ ...m, groupId: g.id }));
  }
  const ep = defaultEpisode(title, markers, groups);
  if (impact) ep.impact = normalizeImpact(impact);
  return ep;
}

const modelOf = (pains, opts) => buildLegend(episodeOf(pains, opts), zoneById);
const at = (zoneId, extra = {}) => ({ zoneId, ...extra });

// The shim records draw calls but not the context state each was made under,
// and two of drawLegendPng's decisions live entirely in that state: the stamp
// is the only right-aligned line, and every line rides a middle baseline so it
// centres on its swatch. Stamp each recorded call with the state it was made in.
function statefulContext() {
  const ctx = recordingContext();
  const record = ctx.fillText;
  ctx.fillText = (text, x, y) => {
    record(text, x, y);
    Object.assign(ctx.calls[ctx.calls.length - 1], { align: ctx.textAlign, baseline: ctx.textBaseline });
  };
  return ctx;
}

const drawnText = ctx => ctx.calls.filter(c => c.op === 'fillText');

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

test('buildLegend counts every pain and every point, and each pain carries its own count and peak', () => {
  const model = modelOf([
    { name: 'Migraine', markers: [
      at('temple-left', { intensity: 4 }),
      at('temple-right', { intensity: 9 }),
      at('behind-eye-left', { intensity: 6 })
    ] },
    { name: 'Sinus', markers: [at('sinus-maxillary-left', { intensity: 5 })] }
  ]);

  assert.equal(model.painCount, 2);
  assert.equal(model.pointCount, 4);
  assert.deepEqual(model.pains.map(p => p.name), ['Migraine', 'Sinus']);
  assert.deepEqual(model.pains.map(p => p.count), [3, 1]);
  assert.deepEqual(model.pains.map(p => p.peak), [9, 5], 'peak is the worst point, not the first or the last');
});

test('the model carries the episode title and timestamp both renderers stamp on the output', () => {
  const ep = episodeOf([{ name: 'A', markers: [at('chin')] }], { title: 'Thursday, bad one' });
  const model = buildLegend(ep, zoneById);
  assert.equal(model.title, 'Thursday, bad one');
  assert.equal(model.updatedAt, ep.updatedAt);
});

test('styleWords speaks the swatch aloud as "<colour>, <pattern>", for a reader who cannot use it', () => {
  const model = modelOf([
    { name: 'A', color: '#38bdf8', pattern: 'ring', markers: [at('chin')] },
    { name: 'B', color: '#f43f5e', pattern: 'dots', markers: [] }
  ]);
  assert.equal(model.pains[0].styleWords, 'sky, ringed');
  assert.equal(model.pains[1].styleWords, 'rose, dotted');
});

test('conditionId travels into the legend, and a group that arrived without the key gets null', () => {
  const ep = episodeOf([{ name: 'Cluster', conditionId: 'cluster-headache', markers: [at('behind-eye-left')] }]);
  // A raw group literal, the shape a legacy share link or an old JSON import
  // delivers: no conditionId key at all. Going through defaultGroup instead
  // would only re-test state.js, which already writes the null itself.
  ep.groups.push({ id: 'g-legacy', name: 'Freeform', color: '#f43f5e', pattern: 'solid' });

  const model = buildLegend(ep, zoneById);
  assert.equal(model.pains[0].conditionId, 'cluster-headache');
  assert.equal(model.pains[1].conditionId, null,
    'undefined here breaks the strict comparisons the panels do downstream');
});

test('a pain with no points gets prose null and peak 0, instead of Math.max of nothing', () => {
  const model = modelOf([
    { name: 'Empty', markers: [] },
    { name: 'Real', markers: [at('chin', { intensity: 7 })] }
  ]);
  assert.equal(model.pains[0].prose, null);
  assert.equal(model.pains[0].count, 0);
  assert.equal(model.pains[0].peak, 0, '-Infinity here renders "worst -Infinity/10" in every row');
  assert.equal(model.pains[1].peak, 7);
  assert.ok(model.pains[1].prose);
});

test('the model carries the impact sentences, so the explain view and the PNG say the same thing', () => {
  const model = modelOf([{ name: 'A', markers: [at('chin')] }], {
    impact: { frequency: 'weekly', duration: 'few-hours', blocked: ['work', 'sleep'], daysLost: 3 }
  });
  assert.deepEqual(model.impact, [
    'It happens about once a week, and lasts for a few hours.',
    'It stops me working and sleeping.',
    'In the last month it cost me about 3 days.'
  ]);
  assert.deepEqual(modelOf([{ name: 'A', markers: [at('chin')] }]).impact, [],
    'an episode with no impact answers must carry no sentences, not an empty-looking one');
});

test('a marker pointing at a pain that no longer exists is not adopted, but is still counted in the header', () => {
  const ep = episodeOf([{ name: 'A', markers: [at('chin')] }]);
  ep.markers.push(defaultMarker({ zoneId: 'temple-left', groupId: 'g-deleted' }));
  const model = buildLegend(ep, zoneById);

  assert.equal(model.pains[0].count, 1);
  assert.ok(!model.pains[0].prose.where.includes('Temple'),
    'a dangling point was drawn into the wrong pain\'s sentence');

  // The one fixture where the header and the rows genuinely disagree, so this
  // is the only place the contract can be stated: pointCount is every point in
  // the episode, orphans included, because repairing an orphan is not the
  // legend's job. state.js:adoptOrphans runs on every load path (persist.js
  // reads, share links, imports), so a live map never reaches here holding one.
  assert.equal(model.pointCount, 2);
  assert.equal(model.pains.reduce((n, p) => n + p.count, 0), 1);
  assert.ok(legendHtml(model).includes('2 points'),
    'the header must report the episode it was given, not the rows it managed to build');
});

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

test('the sentence uses the plain phrasings from zones.js, never the form labels', () => {
  // A sweep: every quality and depth has to produce a sentence at all. The
  // phrasing itself is pinned by the hard-coded sentences below, because a loop
  // that reads q.plain moves wherever zones.js moves.
  for (const q of QUALITIES) {
    const feels = modelOf([{ name: 'A', markers: [at('chin', { quality: q.id })] }]).pains[0].prose.feels;
    assert.ok(feels.toLowerCase().includes(q.plain.toLowerCase()),
      `${q.id}: "${feels}" dropped its plain phrasing`);
  }
  for (const d of DEPTHS) {
    const feels = modelOf([{ name: 'A', markers: [at('chin', { depth: d.id })] }]).pains[0].prose.feels;
    assert.ok(feels.toLowerCase().includes(d.plain.toLowerCase()), `${d.id}: "${feels}" dropped its plain phrasing`);
  }

  const feels = (quality, depth) =>
    modelOf([{ name: 'A', markers: [at('chin', { quality, depth })] }]).pains[0].prose.feels;

  assert.equal(feels('fullness', 'deep-pressure'),
    'A stuffed, about-to-burst pressure, deep against the bone, over about a palm-sized area.');
  assert.equal(feels('ice-pick', 'inside-head'),
    'A split-second stab, gone before you react, deep inside the head, over about a palm-sized area.');
  assert.equal(feels('band-pressure', 'muscle'),
    'Like a tight band squeezing the head, in the muscle, over about a palm-sized area.');
  assert.equal(feels('burning', 'surface'),
    'Hot and burning, right on the skin, over about a palm-sized area.',
    'the form labels ("Pressure / fullness", "Deep / on bone") reached a sentence meant to be read aloud');
});

test('the feels sentence is sentence-cased and stopped, and never empty for a point with no quality', () => {
  const prose = modelOf([{ name: 'A', markers: [at('chin')] }]).pains[0].prose;
  assert.equal(prose.feels, 'Right on the skin, over about a palm-sized area.',
    'depth and spread carry the sentence when no quality was chosen');
  assert.ok(prose.where.endsWith('.'));
  assert.ok(prose.strength.endsWith('.'));
});

test('the commonest depth and quality win, so one odd point does not rewrite the sentence', () => {
  const prose = modelOf([{ name: 'A', markers: [
    at('chin', { quality: 'throbbing', depth: 'inside-head' }),
    at('nose-bridge', { quality: 'throbbing', depth: 'inside-head' }),
    at('temple-left', { quality: 'burning', depth: 'surface' })
  ] }]).pains[0].prose;
  assert.ok(prose.feels.toLowerCase().startsWith('throbbing in time with the heartbeat'), prose.feels);
  assert.ok(prose.feels.includes('deep inside the head'));
  assert.ok(!prose.feels.includes('hot and burning'));
});

test('spread is voted on too, not assumed to be the default palm-sized area', () => {
  const feels = markers => modelOf([{ name: 'A', markers }]).pains[0].prose.feels;
  assert.equal(feels([at('chin', { spread: 'pinpoint' })]), 'Right on the skin, in one small spot.');
  assert.equal(feels([
    at('chin', { spread: 'diffuse' }),
    at('nose-bridge', { spread: 'diffuse' }),
    at('temple-left', { spread: 'pinpoint' })
  ]), 'Right on the skin, spread over several regions.',
  'the odd point out rewrote the size of the pain');
});

test('a left/right pair of the same zone merges into "(both sides)"; one side alone names its side', () => {
  const where = markers => modelOf([{ name: 'A', markers }]).pains[0].prose.where;
  assert.equal(where([at('temple-left'), at('temple-right')]), 'Temple (both sides).');
  assert.equal(where([at('temple-left')]), 'Temple (left).');
  assert.equal(where([at('temple-right')]), 'Temple (right).');
  assert.equal(where([at('temple-left'), at('temple-left')]), 'Temple (left).',
    'two points in one zone are one place');
  assert.equal(where([at('sinus-ethmoid')]), 'Between the eyes.',
    'a zone with no side keeps its label untouched');
});

test('two places read "X and Y" with no comma; three and four take the serial commas', () => {
  const where = ids => modelOf([{ name: 'A', markers: ids.map(z => at(z)) }]).pains[0].prose.where;
  assert.equal(where(['chin', 'nose-bridge']), 'Chin and Bridge of nose.');
  assert.equal(where(['chin', 'nose-bridge', 'sinus-ethmoid']), 'Chin, Bridge of nose and Between the eyes.');
  assert.equal(where(['chin', 'nose-bridge', 'sinus-ethmoid', 'neck-back-upper']),
    'Chin, Bridge of nose, Between the eyes and Back of neck, upper.');
});

test('a long list of places truncates with an honest count, singular at one', () => {
  const six = ['chin', 'sinus-ethmoid', 'nose-bridge', 'neck-back-upper', 'neck-back-mid', 'neck-back-lower'];
  const where = ids => modelOf([{ name: 'A', markers: ids.map(z => at(z)) }]).pains[0].prose.where;

  const w6 = where(six);
  assert.ok(w6.endsWith(', and 2 more places.'), w6);
  assert.ok(w6.includes('Back of neck, upper'), 'the fourth place is listed');
  assert.ok(!w6.includes('Back of neck, middle'), 'the fifth place is behind the cutoff, not listed and counted');
  assert.ok(!w6.includes('Base of neck'));

  assert.ok(where(six.slice(0, 5)).endsWith(', and 1 more place.'), where(six.slice(0, 5)));
  assert.ok(!where(six.slice(0, 4)).includes('more place'), 'exactly four places fit without a cutoff');
});

test('merging sides buys room before the cutoff: four pairs are four places, not eight', () => {
  const ids = ['temple', 'cheek', 'ear', 'tmj'].flatMap(b => [`${b}-left`, `${b}-right`]);
  const where = modelOf([{ name: 'A', markers: ids.map(z => at(z)) }]).pains[0].prose.where;
  assert.ok(!where.includes('more place'), where);
  assert.equal(where,
    'Temple (both sides), Cheek (both sides), In / around ear (both sides) and Jaw joint (TMJ) (both sides).');
});

test('strength reports the peak point and speaks its band in lower case', () => {
  const strength = markers => modelOf([{ name: 'A', markers }]).pains[0].prose.strength;
  assert.equal(
    strength([at('chin', { intensity: 2 }), at('nose-bridge', { intensity: 9 }), at('temple-left', { intensity: 5 })]),
    'Worst 9 out of 10, severe.', 'the worst point is neither the first nor the last one placed');
  assert.equal(strength([at('chin', { intensity: 10 })]), 'Worst 10 out of 10, worst possible.');
  assert.equal(strength([at('chin', { intensity: 2 })]), 'Worst 2 out of 10, mild.');
});

test('a point whose zone the model does not know still gets a where clause', () => {
  const where = modelOf([{ name: 'A', markers: [at(null)] }]).pains[0].prose.where;
  assert.match(where, /^across the head\.$/i, 'an empty "where" leaves the sentence starting with a full stop');
});

// ---------------------------------------------------------------------------
// The DOM renderer
// ---------------------------------------------------------------------------

test('legendHtml escapes pain names and the title, so a shared map cannot inject markup', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const html = legendHtml(modelOf([{ name: evil, markers: [at('chin')] }], { title: `Ep ${evil}` }));
  assert.ok(!html.includes('<img'), 'the raw tag reached the DOM string');
  assert.ok(!html.includes('onerror=alert(1)>'));
  assert.equal(html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g).length, 2,
    'both the title and the row name must be escaped');
});

test('every row carries its pain\'s shape, in its colour, tinted by its peak', () => {
  const model = modelOf([
    { name: 'A', color: '#38bdf8', pattern: 'ring', markers: [at('chin', { intensity: 9 })] },
    { name: 'B', color: '#f43f5e', pattern: 'star', markers: [at('nose-bridge', { intensity: 6 })] }
  ]);
  const glyphs = html => [...html.matchAll(/<span class="legend-glyph">([\s\S]*?)<\/span>/g)].map(m => m[1]);

  const compact = glyphs(legendHtml(model));
  assert.equal(compact.length, 2, 'a row without a swatch has nothing tying it to the points on the head');
  assert.equal(compact[0], patternSvg('ring', paint('#38bdf8', 9), 15));
  assert.equal(compact[1], patternSvg('star', paint('#f43f5e', 6), 15),
    'the second row borrowed the first row\'s shape or colour');

  assert.equal(glyphs(legendHtml(model, { verbose: true }))[0], patternSvg('ring', paint('#38bdf8', 9), 20),
    'the explain view reads at arm\'s length; its swatch is the bigger one');
});

test('the swatch has an intensity floor, so a 1/10 pain and an empty pain still show their colour', () => {
  const html = legendHtml(modelOf([
    { name: 'Faint', color: '#38bdf8', pattern: 'ring', markers: [at('chin', { intensity: 1 })] },
    { name: 'None', color: '#38bdf8', pattern: 'ring', markers: [] }
  ]));
  const fills = [...html.matchAll(/style="color:(rgb\([^)]*\))/g)].map(m => m[1]);

  assert.notEqual(paint('#38bdf8', 1), paint('#38bdf8', 4), 'the floor cannot be shown to do anything here');
  assert.deepEqual(fills, [paint('#38bdf8', 4), paint('#38bdf8', 4)],
    'below the floor the swatch washes towards grey and stops naming its pain');
});

test('the key spells out the ramp, because a washed-out swatch would otherwise read as a different pain', () => {
  const html = legendHtml(modelOf([{ name: 'A', markers: [at('chin', { intensity: 7 })] }]));
  assert.ok(html.includes('legend-ramp'));
  assert.ok(html.includes('>mild<') && html.includes('>worst<'));
  assert.ok(html.includes('stronger colour means more intense'));
});

test('isolating a pain fades every other row and none of its own', () => {
  const model = modelOf([
    { name: 'A', markers: [at('chin')] },
    { name: 'B', markers: [at('nose-bridge')] },
    { name: 'C', markers: [] }
  ]);
  const rows = id => legendHtml(model, { isolateId: id }).split('<li').slice(1);

  const isolated = rows(model.pains[1].id);
  assert.equal(isolated.length, 3, 'isolating hides nothing from the key; it only dims');
  assert.ok(!isolated[1].includes('faded'), 'the isolated pain was dimmed');
  assert.ok(isolated[0].includes('faded') && isolated[2].includes('faded'));
  assert.equal(rows(null).filter(r => r.includes('faded')).length, 0,
    'with nothing isolated every pain reads at full strength');
});

test('legendHtml renders nothing at all for an episode with no pains', () => {
  assert.equal(legendHtml(modelOf([])), '');
  assert.equal(legendHtml(modelOf([]), { verbose: true }), '');
});

test('a row states its point count, its peak and its style words; an empty pain says it has none', () => {
  const html = legendHtml(modelOf([
    { name: 'Migraine', color: '#38bdf8', pattern: 'ring', markers: [
      at('chin', { intensity: 8 }), at('nose-bridge', { intensity: 3 })
    ] },
    { name: 'Idle', color: '#f43f5e', pattern: 'dots', markers: [] }
  ]));
  assert.ok(html.includes('2 points · worst 8/10 · sky, ringed'), html);
  assert.ok(html.includes('no points yet · rose, dotted'));

  const one = legendHtml(modelOf([{ name: 'X', markers: [at('chin', { intensity: 2 })] }]));
  assert.ok(one.includes('1 point · worst 2/10'));
  assert.ok(!one.includes('1 points'), 'the singular has to hold in the row and in the header');
});

test('verbose mode adds the spoken prose that the compact key leaves out', () => {
  const model = modelOf([{ name: 'A', markers: [at('temple-left', { intensity: 9, quality: 'throbbing' })] }]);
  const compact = legendHtml(model);
  const verbose = legendHtml(model, { verbose: true });
  assert.ok(!compact.includes('legend-prose'));
  assert.ok(verbose.includes('legend--verbose'));
  assert.ok(verbose.includes('Temple (left). Worst 9 out of 10, severe. Throbbing in time with the heartbeat'),
    verbose);
});

test('verbose mode on a pain with no points renders the row without prose rather than throwing', () => {
  const html = legendHtml(modelOf([{ name: 'Empty', markers: [] }]), { verbose: true });
  assert.ok(html.includes('Empty'));
  assert.ok(!html.includes('legend-prose'));
});

// ---------------------------------------------------------------------------
// The PNG renderer
// ---------------------------------------------------------------------------

test('drawLegendPng burns the title, every pain name and every impact sentence into the picture', () => {
  const model = modelOf([
    { name: 'Migraine', markers: [at('temple-left', { intensity: 9 })] },
    { name: 'Sinus pressure', markers: [at('sinus-maxillary-left', { intensity: 4 })] }
  ], { impact: { frequency: 'weekly', duration: 'few-hours', daysLost: 3 } });

  const ctx = recordingContext();
  drawLegendPng(ctx, model, { x: 0, y: 0, width: 900, scale: 1 });
  const text = ctx.text();

  assert.ok(text.includes('Tuesday migraine'), 'the exported PNG lost the episode title');
  assert.ok(text.includes('Migraine') && text.includes('Sinus pressure'));
  assert.equal(model.impact.length, 2,
    'the model carried no impact sentences, so the loop below would assert nothing');
  for (const sentence of model.impact) {
    assert.ok(text.includes(sentence), `the PNG dropped the impact sentence "${sentence}"`);
  }
  assert.ok(text.includes('2 points · 2 pains'));
  assert.ok(text.some(t => t.includes('not a diagnosis')),
    'the safety line has to travel with the picture; the PNG outlives the page');
});

test('the PNG row meta repeats the count, peak and style words the screen key shows', () => {
  const model = modelOf([
    { name: 'A', color: '#38bdf8', pattern: 'ring', markers: [at('chin', { intensity: 6 })] },
    { name: 'B', color: '#f43f5e', pattern: 'dots', markers: [] }
  ]);
  const ctx = recordingContext();
  drawLegendPng(ctx, model, { x: 0, y: 0, width: 900, scale: 1 });
  const text = ctx.text();
  assert.ok(text.includes('1 point · worst 6/10 · sky, ringed'), text.join(' | '));
  assert.ok(text.includes('no points · rose, dotted'));
});

test('the PNG draws one swatch per row, centred on it, in that row\'s own colour', () => {
  // Same pattern on both pains, different colours: the glyph cache is keyed on
  // both, and keying it on the pattern alone hands pain B pain A's tint.
  const model = modelOf([
    { name: 'A', color: '#38bdf8', pattern: 'ring', markers: [at('chin', { intensity: 8 })] },
    { name: 'B', color: '#f43f5e', pattern: 'ring', markers: [at('nose-bridge', { intensity: 8 })] }
  ]);
  const s = 2, x = 10, y = 7;
  const ctx = recordingContext();
  drawLegendPng(ctx, model, { x, y, width: 900, scale: s });
  const glyphs = ctx.calls.filter(c => c.op === 'drawImage');

  assert.equal(glyphs.length, 2, 'a row lost its swatch: the PNG names the shape in words it never draws');
  glyphs.forEach((call, i) => {
    const [, gx, gy, w, h] = call.args;
    assert.equal(w, 20 * s, 'the swatch stopped scaling with the export');
    assert.equal(h, 20 * s);
    assert.equal(gx, x + 22 * s, 'the swatch ignored the x it was drawn at');
    assert.equal(gy, y + (56 + 34 * i) * s - 10 * s, 'the swatch is not centred on its row');
  });
  assert.notEqual(glyphs[0].args[0], glyphs[1].args[0],
    'both rows were handed the same cached glyph, so one pain wears the other\'s colour');
});

test('a long impact sentence wraps instead of running off the edge, and every word survives', () => {
  const model = modelOf([{ name: 'A', markers: [at('chin')] }], { impact: { blocked: BLOCKED.map(b => b.id) } });
  const sentence = model.impact[0];
  const ctx = recordingContext();
  drawLegendPng(ctx, model, { x: 0, y: 0, width: 360, scale: 1 });
  const text = ctx.text();

  assert.ok(!text.includes(sentence), 'this sentence cannot fit on one 360px line; it was not wrapped');
  assert.ok(text.join(' ').includes(sentence), 'wrapping lost or reordered words');
});

test('the per-row height legendPngHeight reserves is the pitch drawLegendPng actually steps', () => {
  const one = modelOf([{ name: 'A', markers: [at('chin')] }]);
  const three = modelOf([
    { name: 'A', markers: [at('chin')] },
    { name: 'B', markers: [at('nose-bridge')] },
    { name: 'C', markers: [] }
  ]);

  // Drawn at scale 2 and off the origin, the way export.js does it: the legend
  // sits at y = head height and s = canvas width / 900.
  const s = 2, y = 7;
  const ctx = recordingContext();
  drawLegendPng(ctx, three, { x: 10, y, width: 900, scale: s });
  const rowYs = drawnText(ctx)
    .filter(c => ['A', 'B', 'C'].includes(c.args[0]))
    .map(c => c.args[2]);

  assert.equal(rowYs.length, 3, 'a pain was drawn no row at all');
  assert.equal(rowYs[0], y + 56 * s, 'the first row moved into or out of the title block');
  assert.deepEqual([rowYs[1] - rowYs[0], rowYs[2] - rowYs[1]], [34 * s, 34 * s],
    'the drawn row pitch is not 34px at this scale, so rows crowd or straggle as pains are added');

  const pitch = rowYs[1] - rowYs[0];
  assert.equal(legendPngHeight(three, s) - legendPngHeight(one, s), 2 * pitch,
    'two extra rows were reserved a height that is not the height two extra rows take');
  assert.equal(legendPngHeight(one, 2), legendPngHeight(one) * 2, 'the block scales with the export scale');
});

test('legendPngHeight makes room for the impact sentences, and more room as the canvas narrows', () => {
  const pains = [{ name: 'A', markers: [at('chin')] }];
  const bare = modelOf(pains);
  const loaded = modelOf(pains, {
    impact: { blocked: BLOCKED.map(b => b.id), symptoms: ['nausea', 'light'], frequency: 'daily' }
  });

  assert.ok(legendPngHeight(loaded, 1, 900) > legendPngHeight(bare, 1, 900),
    'the impact sentences were reserved no height and would be drawn over the safety line');
  assert.ok(legendPngHeight(loaded, 1, 320) > legendPngHeight(loaded, 1, 900),
    'a narrower canvas wraps the same sentences onto more lines');
  assert.equal(legendPngHeight(bare, 1, 320), legendPngHeight(bare, 1, 900),
    'with no impact text there is nothing to wrap, so width cannot matter');
});

// The fixture the two geometry tests below share: three pains and enough
// impact prose to wrap several times at any sane export width.
function loadedModel() {
  return modelOf([
    { name: 'Migraine', markers: [at('temple-left', { intensity: 9 })] },
    { name: 'Sinus pressure', markers: [at('sinus-maxillary-left', { intensity: 4 })] },
    { name: 'Neck', markers: [at('trap-left', { intensity: 6 })] }
  ], {
    impact: {
      frequency: 'most-days', duration: 'most-of-day', daysLost: 9,
      blocked: BLOCKED.map(b => b.id), symptoms: ['nausea', 'light', 'sound'], relief: ['dark', 'sleep']
    }
  });
}

// Between the last line of content and the reserved bottom edge sits the
// safety line, and nothing else. The distance is fixed by the layout and does
// not depend on how many pains or impact lines there are, so any drift between
// what legendPngHeight reserves and what drawLegendPng draws moves it.
const SAFETY_GAP = 53;

test('the impact block is reserved height at the width it is actually wrapped to', () => {
  const model = loadedModel();
  // legendPngHeight measures the wrap at `width - 44 * s` and drawLegendPng
  // wraps at `width - 2 * pad`: two independent literals for one quantity.
  // Measuring at the full width silently under-reserves, and the narrower the
  // export the more lines fall out of the block.
  for (const width of [900, 560, 420, 300, 240]) {
    const height = legendPngHeight(model, 1, width);
    const ctx = recordingContext();
    drawLegendPng(ctx, model, { x: 0, y: 0, width, scale: 1 });
    const ys = drawnText(ctx).map(c => c.args[2]);

    assert.equal(ys[ys.length - 1], height - 18, `${width}px: the safety line is off the reserved bottom edge`);
    assert.equal(ys[ys.length - 1] - Math.max(...ys.slice(0, -1)), SAFETY_GAP,
      `${width}px: the impact block was measured at one width and drawn at another, ` +
      'so its last lines fall outside the height the caller sized the canvas to');
  }
});

test('the PNG is drawn where it was told to, in the order and inside the height it reserved', () => {
  const model = loadedModel();
  const width = 420, x = 40, y = 25;   // export.js never draws this block at the origin
  const height = legendPngHeight(model, 1, width);

  const ctx = recordingContext();
  drawLegendPng(ctx, model, { x, y, width, scale: 1 });
  const drawn = drawnText(ctx);
  const ys = drawn.map(c => c.args[2]);

  // The picture line by line: title, right-aligned stamp, a name/meta pair per
  // pain, the impact block wrapped, the safety line last.
  assert.equal(drawn[0].args[0], model.title);
  assert.equal(drawn[1].args[0], '3 points · 3 pains');
  const rows = drawn.slice(2, 2 + 2 * model.pains.length);
  assert.deepEqual(rows.filter((_, i) => i % 2 === 0).map(c => c.args[0]), model.pains.map(p => p.name));
  const impactLines = drawn.slice(2 + 2 * model.pains.length, -1).map(c => c.args[0]);
  assert.ok(impactLines.length > model.impact.length, 'nothing wrapped at 420px; this fixture proves nothing');
  assert.equal(impactLines.join(' '), model.impact.join(' '),
    'the impact block dropped, repeated or reordered a line on its way into the picture');
  assert.ok(drawn[drawn.length - 1].args[0].includes('not a diagnosis'));

  // Origin: every line but the stamp starts one pad in from x, and the stamp is
  // measured from the right edge rather than from x.
  assert.equal(Math.min(...drawn.map(c => c.args[1])), x + 22, 'a line ignored the x it was handed');
  assert.equal(drawn[1].args[1], x + width - 22);
  assert.equal(ys[0], y + 26, 'the first line ignored the y it was handed');

  // The bottom, computed from two independent sides: the reservation from
  // legendPngHeight, the content from the calls actually recorded. Drift in
  // either literal (the row pitch, the 42px tail, the 19px impact line) moves
  // this gap.
  assert.equal(ys[ys.length - 1], y + height - 18, 'the safety line is not sitting on the reserved bottom edge');
  assert.equal(ys[ys.length - 1] - Math.max(...ys.slice(0, -1)), SAFETY_GAP,
    'the safety line and the last line of content drifted: legendPngHeight and drawLegendPng disagree');
});

test('drawLegendPng leaves the canvas as it found it, and right-aligns only the stamp', () => {
  const model = modelOf([
    { name: 'A', markers: [at('chin', { intensity: 5 })] },
    { name: 'B', markers: [at('nose-bridge', { intensity: 2 })] }
  ], { impact: { frequency: 'daily', duration: 'days' } });

  const ctx = statefulContext();
  drawLegendPng(ctx, model, { x: 0, y: 0, width: 900, scale: 1 });
  const drawn = drawnText(ctx);

  assert.equal(ctx.calls[0].op, 'save');
  assert.equal(ctx.calls[ctx.calls.length - 1].op, 'restore',
    'without the restore the export\'s font, fill and baseline leak back to the caller');
  assert.equal(drawn[1].align, 'right', 'the point/pain stamp belongs on the right edge');
  assert.ok(drawn.filter((_, i) => i !== 1).every(c => c.align === 'left'),
    'textAlign was left on "right": every line after the stamp draws backwards off the left edge');
  assert.ok(drawn.every(c => c.baseline === 'middle'),
    'text on the alphabetic baseline sits off-centre from the swatch it labels');
});
