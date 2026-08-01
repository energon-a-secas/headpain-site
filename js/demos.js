// Demo maps — ready-made episodes that teach the multi-group workflow.
// Loading a demo creates a NEW episode in the diary; nothing the user built
// is touched, and the demo can be edited or deleted like any episode.

import { GROUP_COLORS } from './groups.js';

export const DEMOS = [
  {
    id: 'demo-migraine', title: 'Demo · Migraine (one-sided)',
    blurb: 'Throbbing temple and behind-eye pain on one side — the classic attack shape.',
    groups: [{ conditionId: 'migraine-no-aura', name: 'Migraine', color: GROUP_COLORS[0] }]
  },
  {
    id: 'demo-tension', title: 'Demo · Tension-type',
    blurb: 'A tight band across the forehead and neck — both sides, pressing, milder.',
    groups: [{ conditionId: 'tension-type', name: 'Tension band', color: GROUP_COLORS[3] }]
  },
  {
    id: 'demo-cluster', title: 'Demo · Cluster headache',
    blurb: 'Brutal one-sided eye/temple attacks that arrive like an alarm clock.',
    groups: [{ conditionId: 'cluster-headache', name: 'Cluster', color: GROUP_COLORS[2] }]
  },
  {
    id: 'demo-sinusitis', title: 'Demo · Acute rhinosinusitis',
    blurb: 'Heavy pressure behind the cheeks and forehead during a bad cold.',
    groups: [{ conditionId: 'acute-rhinosinusitis', name: 'Sinus pressure', color: GROUP_COLORS[1] }]
  },
  {
    id: 'demo-cervicogenic', title: 'Demo · Cervicogenic headache',
    blurb: 'Starts in the neck on one side and crawls up over the back of the head.',
    groups: [{ conditionId: 'cervicogenic-headache', name: 'Neck-driven', color: GROUP_COLORS[4] }]
  },
  {
    id: 'demo-icepick', title: 'Demo · Ice-pick headache',
    blurb: 'Split-second stabs out of nowhere. Toggle X-ray to see the spike drive inward.',
    groups: [{ conditionId: 'primary-stabbing-headache', name: 'Ice-pick', color: GROUP_COLORS[6] }]
  },
  {
    id: 'demo-combo', title: 'Demo · Combo: sinus infection + ice-pick',
    blurb: 'Two pain types at once — sinus pressure in sky, an ice-pick at the left eye in rose. Click a group to focus it.',
    groups: [
      { conditionId: 'acute-rhinosinusitis', name: 'Sinus pressure', color: GROUP_COLORS[1] },
      {
        name: 'Ice-pick (left eye)', color: GROUP_COLORS[0],
        markers: [{
          zoneId: 'behind-eye-left', intensity: 9, depth: 'surface',
          quality: 'ice-pick', spread: 'pinpoint',
          note: 'Split-second stab, gone before I react'
        }]
      }
    ]
  }
];
