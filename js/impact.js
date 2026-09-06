// What the pain costs — the half of a consultation the map could not carry.
//
// A clinician's first three questions are how often, how long, and what does it
// stop you doing. The tool answered none of them: an episode held a title, two
// timestamps, a camera angle and some points. This module adds the missing half
// and, more importantly, renders it as a sentence, because "3 of 5 activity
// checkboxes" is not something a partner or an employer can read.
//
// Deliberately written in our own words rather than reproducing a named,
// licensed disability instrument. It is a description someone gives, not a
// score anyone should treat as validated.

export const FREQUENCIES = [
  { id: 'rare', label: 'A few times a year', phrase: 'a few times a year' },
  { id: 'monthly', label: 'About once a month', phrase: 'about once a month' },
  { id: 'few-monthly', label: 'A few times a month', phrase: 'a few times a month' },
  { id: 'weekly', label: 'About once a week', phrase: 'about once a week' },
  { id: 'most-days', label: 'Most days', phrase: 'most days' },
  { id: 'daily', label: 'Every day', phrase: 'every day' },
  { id: 'constant', label: 'It never fully goes', phrase: 'without ever fully going away' }
];

export const DURATIONS = [
  { id: 'seconds', label: 'Seconds', phrase: 'for seconds at a time' },
  { id: 'under-1h', label: 'Under an hour', phrase: 'for under an hour' },
  { id: 'few-hours', label: 'A few hours', phrase: 'for a few hours' },
  { id: 'most-of-day', label: 'Most of a day', phrase: 'for most of a day' },
  { id: 'days', label: 'Several days', phrase: 'for several days at a time' },
  { id: 'ongoing', label: 'It does not stop', phrase: 'without stopping' }
];

// Phrased to follow "It stops me …" so the sentence builds itself.
export const BLOCKED = [
  { id: 'work', label: 'Working', phrase: 'working' },
  { id: 'screens', label: 'Using screens', phrase: 'using a screen' },
  { id: 'drive', label: 'Driving', phrase: 'driving' },
  { id: 'sleep', label: 'Sleeping', phrase: 'sleeping' },
  { id: 'care', label: 'Caring for others', phrase: 'looking after the people who depend on me' },
  { id: 'social', label: 'Seeing people', phrase: 'seeing people' },
  { id: 'exercise', label: 'Exercising', phrase: 'exercising' },
  { id: 'chores', label: 'Housework', phrase: 'keeping up with the house' },
  { id: 'lie-down', label: 'I have to lie down', phrase: 'doing anything but lying down' }
];

export const SYMPTOMS = [
  { id: 'nausea', label: 'Nausea', phrase: 'nausea' },
  { id: 'vomiting', label: 'Vomiting', phrase: 'vomiting' },
  { id: 'light', label: 'Light hurts', phrase: 'light hurting' },
  { id: 'sound', label: 'Sound hurts', phrase: 'sound hurting' },
  { id: 'smell', label: 'Smells hurt', phrase: 'smells hurting' },
  { id: 'aura', label: 'Visual aura', phrase: 'visual aura before it starts' },
  { id: 'tearing', label: 'Watering or red eye', phrase: 'a watering or red eye' },
  { id: 'congestion', label: 'Blocked or runny nose', phrase: 'a blocked or runny nose' },
  { id: 'dizzy', label: 'Dizziness', phrase: 'dizziness' },
  { id: 'neck', label: 'Stiff neck', phrase: 'a stiff neck' }
];

export const RELIEF = [
  { id: 'dark', label: 'A dark room', phrase: 'a dark room' },
  { id: 'quiet', label: 'Quiet', phrase: 'quiet' },
  { id: 'sleep', label: 'Sleep', phrase: 'sleep' },
  { id: 'cold', label: 'Something cold', phrase: 'something cold on it' },
  { id: 'heat', label: 'Something warm', phrase: 'something warm on it' },
  { id: 'caffeine', label: 'Caffeine', phrase: 'caffeine' },
  { id: 'air', label: 'Fresh air', phrase: 'fresh air' },
  { id: 'massage', label: 'Massage or stretching', phrase: 'massage or stretching' },
  { id: 'still', label: 'Lying completely still', phrase: 'lying completely still' }
];

export const IMPACT_FIELDS = [
  { key: 'blocked', title: 'What does it stop you doing?', options: BLOCKED },
  { key: 'symptoms', title: 'What comes with it?', options: SYMPTOMS },
  { key: 'relief', title: 'What helps?', options: RELIEF }
];

export function emptyImpact() {
  return { frequency: null, duration: null, blocked: [], symptoms: [], relief: [], daysLost: null };
}

const byId = (list, id) => list.find(o => o.id === id) || null;

export function normalizeImpact(raw) {
  const base = emptyImpact();
  if (!raw || typeof raw !== 'object') return base;
  const pick = (list, id) => (byId(list, id) ? id : null);
  const filter = (list, ids) => (Array.isArray(ids) ? ids.filter(id => byId(list, id)) : []);
  base.frequency = pick(FREQUENCIES, raw.frequency);
  base.duration = pick(DURATIONS, raw.duration);
  base.blocked = filter(BLOCKED, raw.blocked);
  base.symptoms = filter(SYMPTOMS, raw.symptoms);
  base.relief = filter(RELIEF, raw.relief);
  const days = Math.round(Number(raw.daysLost));
  base.daysLost = Number.isFinite(days) && days > 0 ? Math.min(31, days) : null;
  return base;
}

export function hasImpact(impact) {
  if (!impact) return false;
  return Boolean(impact.frequency || impact.duration || impact.daysLost
    || impact.blocked?.length || impact.symptoms?.length || impact.relief?.length);
}

function joinPhrases(list, joiner = 'and') {
  if (list.length <= 1) return list[0] || '';
  if (list.length === 2) return `${list[0]} ${joiner} ${list[1]}`;
  return `${list.slice(0, -1).join(', ')} ${joiner} ${list[list.length - 1]}`;
}

const phrasesOf = (list, ids) => (Array.isArray(ids) ? ids : []).map(id => byId(list, id)?.phrase).filter(Boolean);

// Sentences, not a filled-in form. This is what the explain view shows and what
// the exported PNG carries, so it has to survive being read out loud.
export function impactSentences(impact) {
  if (!hasImpact(impact)) return [];
  const out = [];

  const freq = byId(FREQUENCIES, impact.frequency)?.phrase;
  const dur = byId(DURATIONS, impact.duration)?.phrase;
  if (freq && dur) out.push(`It happens ${freq}, and lasts ${dur}.`);
  else if (freq) out.push(`It happens ${freq}.`);
  else if (dur) out.push(`It lasts ${dur}.`);

  const blocked = phrasesOf(BLOCKED, impact.blocked);
  if (blocked.length) out.push(`It stops me ${joinPhrases(blocked)}.`);

  if (impact.daysLost) {
    out.push(`In the last month it cost me about ${impact.daysLost} day${Number(impact.daysLost) === 1 ? '' : 's'}.`);
  }

  const symptoms = phrasesOf(SYMPTOMS, impact.symptoms);
  if (symptoms.length) out.push(`It comes with ${joinPhrases(symptoms)}.`);

  const relief = phrasesOf(RELIEF, impact.relief);
  if (relief.length) out.push(`What helps: ${joinPhrases(relief)}.`);

  return out;
}

// ---------------------------------------------------------------------------
// Compact form for share links: two indices, three bitmasks and a day count.
// ---------------------------------------------------------------------------

const mask = (list, ids) => (Array.isArray(ids) ? ids : []).reduce((bits, id) => {
  const i = list.findIndex(o => o.id === id);
  return i >= 0 ? bits | (1 << i) : bits;
}, 0);

const unmask = (list, bits) => list.filter((_, i) => (Number(bits) || 0) & (1 << i)).map(o => o.id);

export function packImpact(impact) {
  if (!hasImpact(impact)) return null;
  return [
    FREQUENCIES.findIndex(o => o.id === impact.frequency),
    DURATIONS.findIndex(o => o.id === impact.duration),
    mask(BLOCKED, impact.blocked),
    mask(SYMPTOMS, impact.symptoms),
    mask(RELIEF, impact.relief),
    impact.daysLost || 0
  ];
}

export function unpackImpact(packed) {
  if (!Array.isArray(packed)) return emptyImpact();
  return normalizeImpact({
    frequency: FREQUENCIES[packed[0]]?.id || null,
    duration: DURATIONS[packed[1]]?.id || null,
    blocked: unmask(BLOCKED, packed[2]),
    symptoms: unmask(SYMPTOMS, packed[3]),
    relief: unmask(RELIEF, packed[4]),
    daysLost: packed[5] || null
  });
}
