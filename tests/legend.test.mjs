// The legend: one model, two renderers, and the only thing that makes a map
// readable by someone who did not place the points. This file pins the model
// buildLegend hands to both renderers, the prose it speaks (plain phrasings,
// merged left/right pairs, an honest "and N more"), the escaping the DOM
// renderer owes a name that arrived from a share link, and the text the PNG
// must carry, because the picture is the only copy the doctor gets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordingContext } from './shim.mjs';
import { registry } from './fixtures.mjs';
import { buildLegend, legendHtml, legendPngHeight, drawLegendPng } from '../js/legend.js';
import { defaultEpisode, defaultGroup, defaultMarker } from '../js/state.js';
import { normalizeImpact, BLOCKED } from '../js/impact.js';
import { QUALITIES, DEPTHS } from '../js/zones.js';
import { CONDITIONS } from '../js/conditions.js';

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
  assert.equal(model.pains.reduce((n, p) => n + p.count, 0), model.pointCount,
    'the header count and the rows have to add up, or a point is missing from the key');
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

test('conditionId travels into the legend, and is null rather than undefined when there is none', () => {
  const model = modelOf([
    { name: 'Cluster', conditionId: 'cluster-headache', markers: [at('behind-eye-left')] },
    { name: 'Freeform', markers: [] }
  ]);
  assert.equal(model.pains[0].conditionId, 'cluster-headache');
  assert.ok(CONDITIONS.some(c => c.id === model.pains[0].conditionId),
    'the legend carried an id the condition library does not have');
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

test('a marker pointing at a pain that no longer exists is not silently adopted by another pain', () => {
  const ep = episodeOf([{ name: 'A', markers: [at('chin')] }]);
  ep.markers.push(defaultMarker({ zoneId: 'temple-left', groupId: 'g-deleted' }));
  const model = buildLegend(ep, zoneById);
  assert.equal(model.pains[0].count, 1);
  assert.ok(!model.pains[0].prose.where.includes('Temple'),
    'a dangling point was drawn into the wrong pain\'s sentence');
});

// ---------------------------------------------------------------------------
// The prose
// ---------------------------------------------------------------------------

test('the sentence uses the plain phrasings from zones.js, never the form labels', () => {
  for (const q of QUALITIES) {
    const feels = modelOf([{ name: 'A', markers: [at('chin', { quality: q.id })] }]).pains[0].prose.feels;
    assert.ok(feels.toLowerCase().includes(q.plain.toLowerCase()),
      `${q.id}: "${feels}" dropped its plain phrasing`);
    if (!q.plain.toLowerCase().includes(q.label.toLowerCase())) {
      assert.ok(!feels.includes(q.label), `${q.id}: the sentence read out the form label "${q.label}"`);
    }
  }
  for (const d of DEPTHS) {
    const feels = modelOf([{ name: 'A', markers: [at('chin', { depth: d.id })] }]).pains[0].prose.feels;
    assert.ok(feels.toLowerCase().includes(d.plain.toLowerCase()), `${d.id}: "${feels}" dropped its plain phrasing`);
    if (!d.plain.toLowerCase().includes(d.label.toLowerCase())) {
      assert.ok(!feels.includes(d.label), `${d.id}: the sentence read out the form label "${d.label}"`);
    }
  }

  const feels = modelOf([{ name: 'A', markers: [at('chin', { quality: 'fullness', depth: 'deep-pressure' })] }])
    .pains[0].prose.feels;
  assert.ok(feels.startsWith('A stuffed, about-to-burst pressure'), feels);
  assert.ok(!feels.includes('Pressure / fullness'), 'the form label reached a sentence meant to be read aloud');
  assert.ok(feels.includes('deep against the bone'));
  assert.ok(!feels.includes('Deep / on bone'));
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

test('legendHtml carries the intensity ramp key, because saturation is the second channel', () => {
  const html = legendHtml(modelOf([{ name: 'A', markers: [at('chin', { intensity: 7 })] }]));
  assert.ok(html.includes('legend-ramp'));
  assert.ok(html.includes('>mild<') && html.includes('>worst<'));
  assert.ok(html.includes('stronger colour means more intense'),
    'without the key, a washed-out swatch reads as a different pain');
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

test('a long impact sentence wraps instead of running off the edge, and every word survives', () => {
  const model = modelOf([{ name: 'A', markers: [at('chin')] }], { impact: { blocked: BLOCKED.map(b => b.id) } });
  const sentence = model.impact[0];
  const ctx = recordingContext();
  drawLegendPng(ctx, model, { x: 0, y: 0, width: 360, scale: 1 });
  const text = ctx.text();

  assert.ok(!text.includes(sentence), 'this sentence cannot fit on one 360px line; it was not wrapped');
  assert.ok(text.join(' ').includes(sentence), 'wrapping lost or reordered words');
});

test('legendPngHeight grows with each pain, so a row can never be drawn past the bottom edge', () => {
  const one = modelOf([{ name: 'A', markers: [at('chin')] }]);
  const three = modelOf([
    { name: 'A', markers: [at('chin')] },
    { name: 'B', markers: [at('nose-bridge')] },
    { name: 'C', markers: [] }
  ]);
  assert.ok(legendPngHeight(three) > legendPngHeight(one));
  assert.equal(legendPngHeight(three) - legendPngHeight(one), 68, 'two extra rows at 34px each');
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

test('every line the PNG legend draws lands inside the height it reserved', () => {
  const model = modelOf([
    { name: 'Migraine', markers: [at('temple-left', { intensity: 9 })] },
    { name: 'Sinus pressure', markers: [at('sinus-maxillary-left', { intensity: 4 })] },
    { name: 'Neck', markers: [at('trap-left', { intensity: 6 })] }
  ], {
    impact: {
      frequency: 'most-days', duration: 'most-of-day', daysLost: 9,
      blocked: BLOCKED.map(b => b.id), symptoms: ['nausea', 'light', 'sound'], relief: ['dark', 'sleep']
    }
  });
  const width = 420;
  const height = legendPngHeight(model, 1, width);

  const ctx = recordingContext();
  drawLegendPng(ctx, model, { x: 0, y: 0, width, scale: 1 });
  const ys = ctx.calls.filter(c => c.op === 'fillText').map(c => c.args[2]);

  assert.ok(ys.length > 5);
  assert.ok(Math.min(...ys) >= 0, `text drawn above the block at y=${Math.min(...ys)}`);
  assert.ok(Math.max(...ys) <= height,
    `text drawn at y=${Math.max(...ys)} in a block only ${height}px tall: legendPngHeight and drawLegendPng disagree`);
});
