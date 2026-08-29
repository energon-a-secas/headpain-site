// Intensity-tiered self-care guidance — generic and non-diagnostic by design:
// no drug names, no dosing. The two messages that matter: treat an attack
// early (don't let it climb past 8), and chase the root cause instead of
// letting acute medication become the whole strategy.

export const ROOT_CAUSE_NOTE =
  'Chasing pain down with medication alone can turn an episodic problem into a daily one ' +
  '(medication-overuse headache). Track your triggers, poor sleep, skipped meals, stress ' +
  'let-down, neck strain, long screen sessions, and work with a clinician on the root cause, ' +
  'not just the symptom.';

const RISING = {
  severe: false,
  title: 'Level 7: the moment to stop it reaching 8',
  items: [
    'Act now while it is still climbing: rest, water, a dark room, and whatever early step your clinician has agreed with you.',
    'Catching an attack in its first hour works far better than fighting it at its peak.'
  ]
};

const SEVERE = {
  severe: true,
  title: 'Level 8–10: act now, don’t wait for it to climb',
  items: [
    'Treat early, not late: acute treatments work best at the first sign of an attack, not at peak pain.',
    'Retreat to a dark, quiet, cool room; sip water; a cold pack on the painful area or the back of the neck.',
    'Skip screens, strong smells, and physical exertion until it eases.',
    'If it came on suddenly (“thunderclap”) or is the worst headache of your life → emergency care, skip the map.'
  ]
};

export function guidanceFor(intensity) {
  if (intensity >= 8) return SEVERE;
  if (intensity >= 7) return RISING;
  return null;
}
