// HeadPain condition library + transparent pattern matcher.
// Content follows ICHD-3 patterns (ichd-3.org) and is educational — never diagnostic.
// Zone ids reference assets/zones.baked.json (see js/zones.js).

const LR = id => [`${id}-left`, `${id}-right`];
const LRC = id => [`${id}-left`, `${id}-center`, `${id}-right`];

export const CONDITIONS = [
  // ── COMMON ──────────────────────────────────────────────────────────────
  {
    id: 'migraine-no-aura', name: 'Migraine without aura', tier: 'common',
    primary: [...LR('temple'), ...LR('behind-eye'), ...LRC('forehead-lower')],
    secondary: [...LRC('occipital-upper'), ...LRC('vertex'), 'whole-head'],
    laterality: 'usually-unilateral', depths: ['inside-head', 'deep-pressure'],
    qualities: ['throbbing'], intensity: [4, 9], diffuseTolerant: true,
    time: 'Attacks of 4–72 h; worse with routine activity; often with nausea and/or light and sound sensitivity.',
    differentiators: 'More severe, pulsating, and worsened by activity than tension-type; people want to lie still (cluster patients pace). Sinus-area pressure with congestion is common in migraine itself.',
    redFlags: null,
    feelsLike: 'A pounding, often one-sided headache that makes light, noise, and movement miserable.'
  },
  {
    id: 'migraine-aura', name: 'Migraine with aura', tier: 'common',
    primary: [...LR('temple'), ...LR('behind-eye'), ...LRC('forehead-lower')],
    secondary: [...LRC('occipital-upper'), ...LRC('vertex'), 'whole-head'],
    laterality: 'usually-unilateral', depths: ['inside-head'],
    qualities: ['throbbing'], intensity: [4, 9], diffuseTolerant: true,
    time: 'Visual aura (zigzags, blind spots, shimmering) builds gradually over ≥5 min, lasts ≤60 min, then headache follows within an hour.',
    differentiators: 'The gradual visual build-up separates aura from sudden visual loss (an emergency). Aura is fully reversible.',
    redFlags: 'Sudden (not gradual) vision loss, or a first-ever aura after 40, warrants prompt medical review.',
    feelsLike: 'Shimmering zigzag vision for twenty minutes, then a pounding headache.'
  },
  {
    id: 'tension-type', name: 'Tension-type headache', tier: 'common',
    primary: [...LRC('forehead-upper'), 'forehead-lower-center', ...LR('temple'), 'occipital-upper-center', 'neck-back-upper', 'neck-back-mid'],
    secondary: [...LR('trap'), 'whole-head', 'neck-back-lower'],
    laterality: 'bilateral', depths: ['muscle', 'surface'],
    qualities: ['band-pressure', 'dull-ache'], intensity: [1, 6], diffuseTolerant: true,
    time: '30 minutes to 7 days; not worsened by activity; no vomiting.',
    differentiators: 'Bilateral + pressing + mild-to-moderate + "can still function" points here; throbbing or disabling severity points away.',
    redFlags: null,
    feelsLike: 'A tight band squeezing both sides of the head, annoying but push-through-able.'
  },
  {
    id: 'cluster-headache', name: 'Cluster headache', tier: 'common',
    primary: ['behind-eye-left', 'behind-eye-right', 'temple-left', 'temple-right'],
    secondary: ['forehead-lower-left', 'forehead-lower-right'],
    laterality: 'strict-unilateral', depths: ['deep-pressure', 'inside-head'],
    qualities: ['sharp', 'stabbing', 'burning'], intensity: [8, 10],
    time: 'Attacks of 15–180 min, up to 8×/day, often clock-regular (nightly), in bouts lasting weeks; with same-side red watery eye, blocked/runny nose, eyelid swelling, and restlessness.',
    differentiators: 'Shorter, clock-like, always the same side; the person paces rather than lying still; autonomic signs on the painful side.',
    redFlags: 'A first attack warrants medical evaluation to exclude mimics.',
    feelsLike: 'A red-hot poker behind one eye that arrives like an alarm clock and makes you pace the room.'
  },
  {
    id: 'acute-rhinosinusitis', name: 'Acute rhinosinusitis (true "sinus headache")', tier: 'common',
    primary: [...LR('sinus-frontal'), ...LR('sinus-maxillary'), 'sinus-ethmoid', 'nose-bridge'],
    secondary: ['forehead-lower-center', ...LR('upper-teeth')],
    laterality: 'any', depths: ['deep-pressure'],
    qualities: ['fullness', 'dull-ache'], intensity: [3, 7],
    time: 'Builds during a cold, with fever and colored nasal discharge; eases as the infection clears; worse bending forward.',
    differentiators: 'Self-diagnosed "sinus headache" is usually migraine, in one large study of people with "sinus" headaches and no infection signs, 88% met criteria for migraine (Schreiber 2004). True sinus pain comes with fever, pus-like discharge, and a recent cold, not light sensitivity or nausea.',
    redFlags: 'High fever, facial swelling, vision changes, or confusion → urgent care.',
    feelsLike: 'A heavy, full pressure behind the cheeks and forehead during a bad cold, worse when bending over.'
  },
  {
    id: 'cervicogenic-headache', name: 'Cervicogenic headache', tier: 'common',
    primary: ['neck-back-upper', ...LR('suboccipital'), ...LR('occipital-lower'), ...LR('neck-side')],
    secondary: [...LRC('occipital-upper'), ...LR('temple'), ...LR('behind-eye')],
    laterality: 'strict-unilateral', depths: ['muscle', 'deep-pressure'],
    qualities: ['dull-ache', 'band-pressure'], intensity: [3, 7],
    time: 'Continuous or long-lasting fluctuating pain; linked to a neck disorder; worsened by neck movement or sustained postures.',
    differentiators: 'Starts in the neck and travels forward on one side that never swaps; neck movement reproduces it; no nausea or aura. Dull and continuous (occipital neuralgia is electric and paroxysmal).',
    redFlags: 'After trauma, or with progressive arm symptoms → medical review.',
    feelsLike: 'A stiff, achy pain that starts in the neck on one side and crawls up over the back of the head.'
  },
  {
    id: 'occipital-neuralgia', name: 'Occipital neuralgia', tier: 'common',
    primary: [...LR('suboccipital'), ...LR('occipital-lower'), ...LRC('occipital-upper')],
    secondary: [...LRC('vertex'), ...LR('mastoid'), ...LR('behind-eye')],
    laterality: 'usually-unilateral', depths: ['surface'],
    qualities: ['electric', 'stabbing', 'sharp', 'burning', 'tender-touch'], intensity: [6, 9],
    time: 'Paroxysmal attacks lasting seconds to minutes; a tender spot where the nerve exits the skull; brushing hair can hurt.',
    differentiators: 'Electric jabs along the back of the scalp plus a tender trigger point; continuous aching is a different pattern (think cervicogenic).',
    redFlags: null,
    feelsLike: 'Electric zaps up the back of the head: even brushing hair hurts.'
  },
  {
    id: 'tmj-dysfunction', name: 'TMJ dysfunction pain', tier: 'common',
    primary: [...LR('tmj'), ...LR('ear'), ...LR('jaw-angle')],
    secondary: [...LR('temple'), ...LR('cheek')],
    laterality: 'any', depths: ['muscle', 'deep-pressure'],
    qualities: ['dull-ache', 'tender-touch'], intensity: [2, 6],
    time: 'Worse with chewing, yawning, or in the morning (if grinding); often a clicking or popping joint.',
    differentiators: 'Pain tracks jaw use, not time of day; "earache" with a normal ear exam is classically TMJ referral.',
    redFlags: 'Jaw locking shut, or facial swelling with fever → medical/dental review.',
    feelsLike: 'A dull ache in front of the ear that flares when chewing, with a clicky jaw.'
  },
  {
    id: 'medication-overuse-headache', name: 'Medication-overuse headache', tier: 'common',
    primary: ['whole-head'],
    secondary: [...LRC('forehead-upper'), ...LRC('occipital-upper')],
    laterality: 'bilateral', depths: ['inside-head', 'muscle'],
    qualities: ['dull-ache', 'band-pressure'], intensity: [2, 7], diffuseTolerant: true,
    time: 'Headache ≥15 days/month in someone using acute pain medication regularly for >3 months (≥10 days/month for triptans/opioids/combinations; ≥15 for simple analgesics).',
    differentiators: 'The diary tells the story: headache days and pill days climbing together; often worst on waking.',
    redFlags: null,
    feelsLike: 'A daily dull head fog that painkillers barely touch anymore.'
  },
  {
    id: 'eye-strain', name: 'Eye strain', tier: 'common',
    primary: [...LRC('forehead-lower'), ...LR('behind-eye')],
    secondary: ['sinus-ethmoid', ...LR('temple')],
    laterality: 'bilateral', depths: ['surface', 'deep-pressure'],
    qualities: ['dull-ache', 'fullness'], intensity: [1, 4],
    time: 'Builds during prolonged close visual work; absent on waking; eases with rest or corrected lenses.',
    differentiators: 'Task-linked and mild; disappears with rest; severe or one-sided pain is not "just eye strain".',
    redFlags: 'Sudden vision change, or a painful red eye with halos → emergency (possible acute glaucoma).',
    feelsLike: 'A tired, achy heaviness behind the eyes after hours at a screen.'
  },

  // ── ADVANCED ────────────────────────────────────────────────────────────
  {
    id: 'chiari-1', name: 'Chiari malformation type I', tier: 'advanced',
    primary: [...LR('suboccipital'), ...LRC('occipital-lower')],
    secondary: [...LRC('occipital-upper'), ...LRC('vertex'), 'neck-back-upper', ...LR('trap'), ...LR('behind-eye')],
    laterality: 'any', depths: ['deep-pressure', 'inside-head'],
    qualities: ['fullness', 'dull-ache', 'sharp'], intensity: [5, 9],
    time: 'Classically short (<5 min) occipital/suboccipital pain provoked by coughing, sneezing, or straining; many also report longer occipital pressure with neck and shoulder pain.',
    differentiators: 'The cough/Valsalva trigger is the signature, "pain explodes at the back of my head when I cough or sneeze." Defined on MRI (cerebellar tonsils ≥5 mm below the foramen magnum); often found in adults, frequently incidental. Cough-triggered headache itself warrants imaging.',
    redFlags: 'Unsteady walking, swallowing/choking problems, or hand numbness/weakness → prompt neurology referral.',
    feelsLike: 'A hammer blow at the back of the skull every time you cough, sneeze, or strain.'
  },
  {
    id: 'chiari-2', name: 'Chiari malformation type II (Arnold-Chiari)', tier: 'advanced', notMappable: true,
    primary: [], secondary: [],
    laterality: 'any', depths: [], qualities: [], intensity: [0, 0],
    time: 'Congenital: present at birth, almost always with open spina bifida (myelomeningocele).',
    differentiators: 'A pediatric structural malformation diagnosed in infancy, not an adult headache pattern.',
    redFlags: null, congenital: true,
    feelsLike: 'A condition babies are born with, usually alongside spina bifida.'
  },
  {
    id: 'chiari-3', name: 'Chiari malformation type III', tier: 'advanced', notMappable: true,
    primary: [], secondary: [],
    laterality: 'any', depths: [], qualities: [], intensity: [0, 0],
    time: 'The rarest, most severe Chiari type: brain tissue herniates through a low occipital/high cervical encephalocele, visible at birth.',
    differentiators: 'A neonatal surgical condition: never a self-checkable headache pattern.',
    redFlags: null, congenital: true,
    feelsLike: 'A severe malformation diagnosed at birth as a visible sac at the back of the skull or neck.'
  },
  {
    id: 'trigeminal-neuralgia', name: 'Trigeminal neuralgia', tier: 'advanced',
    primary: [...LR('cheek'), ...LR('sinus-maxillary'), ...LR('jaw-angle'), 'chin', ...LR('upper-teeth')],
    secondary: [...LR('tmj'), ...LR('ear'), ...LRC('forehead-lower'), 'nose-bridge'],
    laterality: 'strict-unilateral', depths: ['surface'],
    qualities: ['electric', 'sharp', 'stabbing'], intensity: [8, 10],
    time: 'Paroxysms lasting a fraction of a second to 2 minutes, triggered by light touch, chewing, tooth-brushing, shaving, or cold air; pain-free between attacks.',
    differentiators: 'Face-only, electric, and triggerable by touch. The trigger zones (beside nose, lips, gums) are nearly pathognomonic. Branch map: V1 forehead/eye (rare), V2 cheek/upper teeth, V3 jaw/chin.',
    redFlags: 'Onset under 40, bilateral, or with sensory loss → imaging to exclude other causes.',
    feelsLike: 'A lightning bolt in the cheek when brushing teeth or when a breeze hits the face.'
  },
  {
    id: 'sunct-suna', name: 'SUNCT / SUNA', tier: 'advanced',
    primary: [...LR('behind-eye'), ...LRC('forehead-lower'), ...LR('temple')],
    secondary: [],
    laterality: 'strict-unilateral', depths: ['surface', 'deep-pressure'],
    qualities: ['electric', 'stabbing', 'burning'], intensity: [5, 9],
    time: 'Single stabs or groups lasting 1–600 seconds, at least once a day (often dozens); with a dramatically red, tearing eye (SUNCT) or other autonomic signs (SUNA).',
    differentiators: 'Ultra-brief eye-area stabs with autonomic flooding; ~100× shorter than cluster; centered around the eye unlike trigeminal neuralgia.',
    redFlags: 'New onset → specialist review and MRI are recommended.',
    feelsLike: 'One-second electric stabs around the eye, dozens of times a day, with the eye pouring tears.'
  },
  {
    id: 'paroxysmal-hemicrania', name: 'Paroxysmal hemicrania', tier: 'advanced',
    primary: [...LR('behind-eye'), ...LR('temple')],
    secondary: [...LRC('forehead-lower')],
    laterality: 'strict-unilateral', depths: ['deep-pressure', 'inside-head'],
    qualities: ['sharp', 'stabbing', 'throbbing'], intensity: [7, 9],
    time: 'Attacks of 2–30 minutes, more than 5 per day, with same-side autonomic signs; specialists confirm it because indomethacin prevents it completely.',
    differentiators: 'Think "cluster, but shorter, more frequent, and erased by one specific medicine."',
    redFlags: 'New pattern with same-side autonomic signs → evaluation to exclude secondary causes.',
    feelsLike: 'Cluster-like attacks many times a day.'
  },
  {
    id: 'hemicrania-continua', name: 'Hemicrania continua', tier: 'advanced',
    primary: ['temple-left', 'temple-right', 'forehead-lower-left', 'forehead-lower-right', 'behind-eye-left', 'behind-eye-right'],
    secondary: ['occipital-upper-left', 'occipital-upper-right'],
    laterality: 'strict-unilateral', depths: ['inside-head', 'deep-pressure'],
    qualities: ['dull-ache', 'stabbing', 'throbbing'], intensity: [2, 9],
    time: 'Continuous, one-sided, every single day for >3 months, with moderate-to-severe flares; specialists confirm it via complete response to indomethacin.',
    differentiators: 'The continuity: "one side of my head has hurt every day for months", separates it from every episodic condition.',
    redFlags: 'Any new continuous one-sided headache merits clinician review.',
    feelsLike: 'One side of the head aches 24/7 and sometimes spikes. It never fully stops.'
  },
  {
    id: 'primary-stabbing-headache', name: 'Primary stabbing headache ("ice-pick")', tier: 'advanced',
    primary: [...LR('behind-eye'), ...LR('temple'), ...LR('parietal'), ...LRC('forehead-upper')],
    secondary: [],
    laterality: 'any', depths: ['surface'],
    qualities: ['ice-pick'], intensity: [7, 10],
    time: 'A single stab or series lasting up to a few seconds, at irregular frequency, with no other symptoms.',
    differentiators: 'Instant, wandering, symptom-free stabs; if stabs always hit the same eye with tearing → think SUNCT instead.',
    redFlags: 'Stabs locked to one spot with other symptoms → review.',
    feelsLike: 'An ice pick jabs the head for two seconds, out of nowhere, then it\'s gone.'
  },
  {
    id: 'giant-cell-arteritis', name: 'Giant cell (temporal) arteritis: pattern', tier: 'advanced',
    primary: [...LR('temple'), ...LR('jaw-angle')],
    secondary: [...LRC('forehead-upper'), ...LR('cheek')],
    laterality: 'any', depths: ['surface', 'muscle'],
    qualities: ['dull-ache', 'tender-touch', 'burning'], intensity: [3, 8],
    time: 'NEW headache in someone over 50, with scalp tenderness (hurts to brush hair or rest on a pillow) and jaw claudication. The jaw aches and tires while chewing.',
    differentiators: 'Age over 50 + new headache + jaw pain when chewing + tender scalp; common headaches don\'t cause jaw claudication.',
    redFlags: 'Any visual symptom: transient dimming or loss, double vision, is an emergency. New headache over 50 with jaw pain when chewing → same-week doctor.',
    feelsLike: 'A new, tender, throbbing temple headache: and the jaw tires out when chewing.'
  },
  {
    id: 'iih', name: 'Idiopathic intracranial hypertension: pattern', tier: 'advanced',
    primary: ['whole-head', ...LR('behind-eye')],
    secondary: [...LRC('occipital-upper'), ...LRC('occipital-lower')],
    laterality: 'any', depths: ['inside-head', 'deep-pressure'],
    qualities: ['fullness', 'throbbing', 'band-pressure'], intensity: [3, 8], diffuseTolerant: true,
    time: 'Daily headache, characteristically worse lying down or on waking, aggravated by coughing/straining; often with pulsatile "whooshing" tinnitus and seconds-long visual gray-outs.',
    differentiators: 'Daily diffuse pressure + whooshing in the ears + brief visual gray-outs + worse when lying down.',
    redFlags: 'Visual obscurations or any sustained vision change → urgent assessment.',
    feelsLike: 'A daily pressure-cooker headache with a whooshing sound in the ears, worse when lying down.'
  },
  {
    id: 'secondary-red-flag-pattern', name: 'Serious secondary headache: warning pattern', tier: 'advanced',
    hiddenFromMatcher: true,
    primary: [], secondary: [],
    laterality: 'any', depths: ['inside-head', 'deep-pressure'], qualities: [], intensity: [8, 10],
    time: 'Two shapes: (a) thunderclap, maximal within seconds; (b) progressive, new headache worsening over days to weeks, worse in mornings or with straining.',
    differentiators: 'The pattern, not the location, is the signal. This entry powers the safety banner. It is never a match result.',
    redFlags: null,
    feelsLike: '"This headache is different from anything I\'ve had, and it\'s getting worse."'
  }
];

// ---------------------------------------------------------------------------
// Guardrail copy (exact strings — do not paraphrase)
// ---------------------------------------------------------------------------

export const MATCHER_DISCLAIMER =
  'HeadPain compares your map with published headache patterns. It cannot diagnose you. ' +
  'Many different conditions share the same locations, and real people rarely match textbooks exactly. ' +
  'Use this to describe your pain to a clinician, not to rule anything in or out.';

export const CARD_DISCLAIMER = 'Educational pattern only. See a qualified clinician for diagnosis.';

export const CONGENITAL_NOTE =
  'This is a congenital condition identified at birth, included for learning, not something an adult can self-check with a pain map.';

export const MATCH_CAP_NOTE =
  'Match % means "how closely your map resembles a published textbook pattern". It is not the probability that you have this condition.';

export const RED_FLAG_LIST = [
  'came on suddenly and was at maximum intensity within seconds ("thunderclap")',
  'is the worst headache of your life',
  'comes with fever and a stiff neck, confusion, fainting, weakness or numbness on one side, trouble speaking, or vision loss',
  'started after a head injury',
  'is new and getting steadily worse over days or weeks',
  'is new after age 50, or you\'re pregnant or recently gave birth, or you have cancer or a weakened immune system'
];

// ---------------------------------------------------------------------------
// Pattern matcher — transparent scoring, max 95, threshold 30, top 5
// ---------------------------------------------------------------------------

const QUALITY_CONTRADICTIONS = {
  'tension-type': ['throbbing'],
  'trigeminal-neuralgia': ['band-pressure'],
  'cluster-headache': ['band-pressure']
};

function markerSides(markers, zoneById) {
  const sides = new Set();
  for (const m of markers) {
    const z = zoneById(m.zoneId);
    if (z && (z.side === 'left' || z.side === 'right')) sides.add(z.side);
  }
  return sides;
}

export function scoreConditions(markers, zoneById) {
  if (!markers.length) return [];
  const totalIntensity = markers.reduce((s, m) => s + Math.max(1, m.intensity), 0);
  const sides = markerSides(markers, zoneById);
  const unilateral = sides.size === 1;
  const bothSides = sides.size === 2;
  const userQualities = new Set(markers.map(m => m.quality).filter(Boolean));
  const userDepths = new Set(markers.map(m => m.depth).filter(Boolean));

  const results = [];
  for (const c of CONDITIONS) {
    if (c.hiddenFromMatcher || c.notMappable) continue;

    // 1. intensity-weighted zone overlap (0–70)
    let weighted = 0;
    const hitZones = new Set();
    for (const m of markers) {
      const i = Math.max(1, m.intensity);
      let w = 0;
      if (m.zoneId === 'whole-head') {
        w = c.diffuseTolerant ? 0.6 : 0;
      } else if (c.primary.includes(m.zoneId)) {
        w = 1.0; hitZones.add(m.zoneId);
      } else if (c.secondary.includes(m.zoneId)) {
        w = 0.4; hitZones.add(m.zoneId);
      }
      weighted += i * w;
    }
    const zoneScore = 70 * (weighted / totalIntensity);

    // 2. laterality (±10, strict-unilateral mismatch caps at 40)
    let latScore = 0, capped = false, latNote = null;
    if (c.laterality === 'strict-unilateral') {
      if (unilateral && markers.length > 0) { latScore = 10; latNote = 'strictly one-sided ✓'; }
      else if (bothSides) { latScore = -10; capped = true; latNote = 'usually one side only: less typical'; }
    } else if (c.laterality === 'usually-unilateral') {
      latScore = unilateral ? 5 : 2;
      if (unilateral) latNote = 'often one-sided ✓';
    } else if (c.laterality === 'bilateral') {
      latScore = bothSides || sides.size === 0 ? 5 : 0;
    }

    // 3. quality (±10, contradiction −8, missing data → 0)
    let qScore = 0;
    const matchedQ = [...userQualities].filter(q => c.qualities.includes(q));
    if (matchedQ.length) qScore = 10;
    const contra = (QUALITY_CONTRADICTIONS[c.id] || []).some(q => userQualities.has(q));
    if (contra) qScore = -8;

    // 4. depth (±5/−3)
    let dScore = 0;
    if ([...userDepths].some(d => c.depths.includes(d))) dScore = 5;
    else if (userDepths.size && c.depths.length) dScore = -3;

    let raw = zoneScore + latScore + qScore + dScore;
    if (capped) raw = Math.min(raw, 40);
    const score = Math.max(0, Math.min(95, Math.round(raw)));
    if (score < 30) continue;

    results.push({ condition: c, score, hitZones: [...hitZones], latNote, matchedQ });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(r => ({ ...r, explanation: explain(r, markers.length) }));
}

function explain(r, markerCount) {
  const parts = [];
  if (r.hitZones.length) {
    parts.push(`${r.hitZones.length} of your ${markerCount} point${markerCount === 1 ? '' : 's'} ` +
      `${markerCount === 1 ? 'is' : 'are'} in zones typical of this pattern`);
  } else {
    parts.push('Your points only loosely overlap this pattern');
  }
  if (r.latNote) parts.push(r.latNote);
  if (r.matchedQ.length) parts.push(`"${r.matchedQ[0].replace('-', ' ')}" fits this pattern ✓`);
  return parts.join(' · ');
}

// Load a condition as starting points: one marker per primary zone (mid intensity).
export function presetMarkers(condition) {
  const i = Math.round((condition.intensity[0] + condition.intensity[1]) / 2);
  const depth = condition.depths[0] || 'surface';
  const quality = condition.qualities[0] || null;
  // Strict-unilateral patterns: seed one side only — a bilateral map would teach the wrong shape.
  const zones = condition.laterality === 'strict-unilateral'
    ? condition.primary.filter(z => !z.endsWith('-right'))
    : condition.primary;
  return zones.map(zoneId => ({
    zoneId, intensity: Math.min(10, Math.max(1, i)), depth, quality, spread: 'regional', note: ''
  }));
}
