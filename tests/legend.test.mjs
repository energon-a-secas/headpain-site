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
  // Both sites must be escaped, and the two assertions above already prove no
  // site escaped none of it, so "at least twice" is the whole contract. An exact
  // count would instead pin how many times the name happens to be written out,
  // and go red the day a row grows a tooltip or an aria-label carrying it.
  const escaped = html.match(/&lt;img src=x onerror=alert\(1\)&gt;/g) || [];
  assert.ok(escaped.length >= 2,
    `both the title and the row name must reach the page escaped; ${escaped.length} did`);
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
  // Drawn twice, so the swatch can be checked against things that move with it
  // (the row it labels, the margin the text uses, the origin it was handed)
  // rather than against a restatement of the layout arithmetic. Its size and the
  // pad are taste; being square, sharing the margin, sitting on the row's own
  // baseline and scaling with the export are the contract.
  const draw = (s, x = 10, y = 7) => {
    const ctx = recordingContext();
    drawLegendPng(ctx, model, { x, y, width: 900, scale: s });
    const lines = drawnText(ctx);
    return {
      glyphs: ctx.calls.filter(c => c.op === 'drawImage'),
      left: lines[0].args[1],
      names: lines.filter(c => model.pains.some(p => p.name === c.args[0]))
    };
  };
  const s = 2;
  const { glyphs, left, names } = draw(s);

  assert.equal(glyphs.length, 2, 'a row lost its swatch: the PNG names the shape in words it never draws');
  assert.equal(names.length, 2, 'a row lost its name, so there is nothing left to centre a swatch on');
  glyphs.forEach((call, i) => {
    const [, , gy, w, h] = call.args;
    assert.ok(w > 0, 'the swatch was drawn at zero size');
    assert.equal(h, w, 'the swatch is no longer square, so its glyph is stretched');
    assert.equal(call.args[1], left,
      'the swatch does not start on the left margin the title and the row names use');
    assert.equal(gy + h / 2, names[i].args[2],
      'the swatch is not centred on its row: it rides above or below the name it labels');
  });

  assert.equal(draw(1).glyphs[0].args[3] * s, glyphs[0].args[3], 'the swatch stopped scaling with the export');
  assert.deepEqual(draw(s, 10 + 40).glyphs.map(c => [c.args[1] - 40, c.args[2]]),
    glyphs.map(c => [c.args[1], c.args[2]]), 'the swatch ignored the x it was drawn at');

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
  assert.deepEqual([rowYs[1] - rowYs[0], rowYs[2] - rowYs[1]], [34 * s, 34 * s],
    'the drawn row pitch is not 34px at this scale, so rows crowd or straggle as pains are added');

  const pitch = rowYs[1] - rowYs[0];

  // Exactly where the first row sits under the title is headroom, and headroom
  // is taste. What the reserved height depends on is that the title block clears
  // the rows without growing into the space a row was reserved.
  const titleY = drawnText(ctx)[0].args[2];
  assert.ok(rowYs[0] > titleY, 'the first row was drawn on top of the title');
  assert.ok(rowYs[0] - titleY < pitch,
    'the title block grew past a whole row, so it no longer fits the height reserved above the rows');
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

// Between the last line of content and the reserved bottom edge sits the safety
// line, and nothing else. Both distances are fixed by the layout and depend on
// neither the export width nor how much content is stacked above them, so any
// drift between what legendPngHeight reserves and what drawLegendPng draws
// changes one of them. They are measured here, not pinned: the pixel values are
// layout taste, and nudging the safety line inside a block it already fits in
// breaks nothing a reader would notice.
function tailOf(model, { width = 900, scale: s = 1, x = 0, y = 0 } = {}) {
  const height = legendPngHeight(model, s, width);
  const ctx = recordingContext();
  drawLegendPng(ctx, model, { x, y, width, scale: s });
  const ys = drawnText(ctx).map(c => c.args[2]);
  return {
    gap: ys[ys.length - 1] - Math.max(...ys.slice(0, -1)),   // last content → safety line
    bottom: y + height - ys[ys.length - 1]                   // safety line → reserved bottom edge
  };
}

// deepEqual against a constant-filled copy, so a failure prints every value
// instead of just "false".
const assertAllSame = (values, message) => assert.deepEqual(values, values.map(() => values[0]), message);

test('the impact block is reserved height at the width it is actually wrapped to', () => {
  const model = loadedModel();
  // legendPngHeight measures the wrap at `width - 44 * s` and drawLegendPng
  // wraps at `width - 2 * pad`: two independent literals for one quantity.
  // Measuring at the full width silently under-reserves, and the narrower the
  // export the more lines fall out of the block.
  const widths = [900, 560, 420, 300, 240];
  const tails = widths.map(width => tailOf(model, { width }));

  widths.forEach((width, i) => {
    assert.ok(tails[i].bottom > 0, `${width}px: the safety line is drawn past the reserved bottom edge`);
    assert.ok(tails[i].gap > 0, `${width}px: the safety line is drawn on top of the last line of content`);
  });
  assertAllSame(tails.map(t => t.bottom),
    'the safety line sits at a different depth in the block at different export widths');
  assertAllSame(tails.map(t => t.gap),
    'the impact block was measured at one width and drawn at another, ' +
    'so its last lines fall outside the height the caller sized the canvas to');
});

test('the PNG is drawn where it was told to, in the order and inside the height it reserved', () => {
  const model = loadedModel();
  const width = 420, x = 40, y = 25;   // export.js never draws this block at the origin

  const ctx = recordingContext();
  drawLegendPng(ctx, model, { x, y, width, scale: 1 });
  const drawn = drawnText(ctx);

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

  // Origin: the whole block is one translation of itself, so the x and y it was
  // handed move every line rather than only the first; and the margins match,
  // the stamp inset from the right edge by the same pad the rest take from the
  // left. The size of that pad is taste, so it is measured, not named.
  const moved = recordingContext();
  drawLegendPng(moved, model, { x: x + 13, y: y + 29, width, scale: 1 });
  assert.deepEqual(drawnText(moved).map(c => [c.args[1] - 13, c.args[2] - 29]),
    drawn.map(c => [c.args[1], c.args[2]]),
    'a line ignored the x or the y it was handed: the block is not drawn relative to its origin');

  const pad = Math.min(...drawn.map(c => c.args[1])) - x;
  assert.ok(pad > 0, 'a line starts on or outside the left edge of the block');
  assert.equal(drawn[1].args[1], x + width - pad,
    'the stamp is not inset from the right edge by the margin the other lines take from the left');

  // The bottom, computed from two independent sides: the reservation from
  // legendPngHeight, the content from the calls actually recorded. Drift in
  // either layout literal (the row pitch, the tail, the impact line height)
  // shows up as a tail that differs between a big map and a small one.
  const tail = tailOf(model, { width, x, y });
  const small = tailOf(modelOf([{ name: 'A', markers: [at('chin')] }], { impact: { frequency: 'daily' } }));
  assert.ok(tail.bottom > 0, 'the safety line is drawn below the bottom edge the caller sized the canvas to');
  assert.ok(tail.gap > 0, 'the safety line is drawn on top of the last line of content');
  assert.deepEqual([tail.gap, tail.bottom], [small.gap, small.bottom],
    'the tail of the block depends on how many pains and impact lines are above it: ' +
    'legendPngHeight and drawLegendPng disagree');
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
