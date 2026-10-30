// Two share links minted before the 2026-10-30 zone fix, kept as the payloads a
// recipient's URL carries after #m=. Both were built by f8a39c1's own modules,
// from a worktree of that commit with its tests/shim.mjs and fixtures.mjs:
//
//   demoMigraine  episodeFromDemo('demo-migraine'), then serializeForUrl: seven
//                 points placed by name, each on f8a39c1's anchor for its zone.
//   taps          four taps and a whole-head point added with state.js's
//                 addMarker. Each tap's p and n are where three's raycast lands
//                 on assets/head-cropped.glb (unchanged since) for one of the
//                 clinical sites in tests/zones-taps, and its zone is what
//                 f8a39c1's atlas named it there: a cheekbone read Lower
//                 forehead, the ear canal Jaw joint, the nose tip Lower forehead
//                 and the top of the back of the neck Where skull meets neck.
//                 The whole-head point sits on f8a39c1's WHOLE_HEAD_SPOT.
//
// Plain strings and no imports, so tests/browser.html loads this file too.

export const PRE_FIX_LINKS = {
  demoMigraine: 'eyJ2IjoyLCJ0IjoiRGVtbyDCtyBNaWdyYWluZSAob25lLXNpZGVkKSIsImMiOlswLDEuNTcxLDQuOV0sImkiOm51bGwsImciOltbIk1pZ3JhaW5lIiwwLCJtaWdyYWluZS1uby1hdXJhIiwwXV0sIm0iOltbNywwLjU1OCwtMC4yNDYsMC4yNzYsMC45ODQsLTAuMTEsMC4xNDIsNywzLDAsMiwiIiwwXSxbOCwtMC41NzEsLTAuMjQyLDAuMjk0LC0wLjk4NiwtMC4xMTgsMC4xMiw3LDMsMCwyLCIiLDBdLFs5LDAuMjY0LC0wLjI5MiwwLjc4MiwwLjM3NCwwLjEyNSwwLjkxOSw3LDMsMCwyLCIiLDBdLFsxMCwtMC4yMzcsLTAuMzMzLDAuODA4LC0wLjIxNCwwLjE0NCwwLjk2Niw3LDMsMCwyLCIiLDBdLFs0LDAuMjY3LC0wLjE5NCwwLjc1NSwwLjM5NCwwLjMxNywwLjg2Myw3LDMsMCwyLCIiLDBdLFs2LC0wLjAwMywtMC4xMDEsMC45NjksMC4xMTYsMC42MjcsMC43Nyw3LDMsMCwyLCIiLDBdLFs1LC0wLjEzNiwtMC4yMDYsMC44OTQsLTAuODMzLDAuNDYxLDAuMzA3LDcsMywwLDIsIiIsMF1dfQ',
  taps: 'eyJ2IjoyLCJ0IjoiQmVmb3JlIHRoZSB6b25lIGZpeCIsImMiOlswLDEuNTcxLDQuOV0sImkiOm51bGwsImciOltbIlRhcHMiLDAsIiIsMF1dLCJtIjpbWzQsMC40MTksLTAuMSwwLjYzOSwwLjYxMiwwLjI4MywwLjczOCw2LDAsLTEsMSwiY2hlZWtib25lIEwiLDBdLFsxOSwwLjUwMSwtMC4xNzEsMC4wNjYsMC44NjMsLTAuMTQ4LC0wLjQ4Miw2LDAsLTEsMSwiZWFyIGNhbmFsIG9wZW5pbmcgTCIsMF0sWzYsMCwtMC4yMDUsMS4wMywtMC4yMSwwLjE3OSwwLjk2MSw2LDAsLTEsMSwibm9zZSB0aXAiLDBdLFs0MiwwLC0wLjU4MiwtMC42MSwwLjE1NiwwLjA2MiwtMC45ODYsNiwwLC0xLDEsInVwcGVyIGJhY2sgb2YgbmVjaywgbWlkbGluZSIsMF0sWzUxLDAsMC4yLDAuOTUsMCwwLDEsMywwLC0xLDMsImV2ZXJ5d2hlcmUiLDBdXX0'
};
