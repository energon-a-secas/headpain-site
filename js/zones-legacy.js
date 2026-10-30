// FROZEN. Where every zone sat before the 2026-10-30 fix, and nothing else.
//
// Generated once from f8a39c1's assets/zones.baked.json (git show
// f8a39c1:assets/zones.baked.json), each anchor and normal rounded the way a
// share link rounds them (round3 in js/persist.js), and the WHOLE_HEAD_SPOT
// constant f8a39c1's js/presets.js placed whole-head points at. Never
// regenerate it from the current bake: its one job is to recognise a point
// placed by name in that frame, so a table that followed the bake would match
// today's anchors and migrate nothing. js/migrate.js reads it.

const frozen = (p, n) => Object.freeze({ p: Object.freeze(p), n: Object.freeze(n) });

export const PRE_FIX_ANCHORS = Object.freeze({
  'forehead-upper-left':     frozen([0.31, 0.148, 0.773], [0.361, -0.425, 0.83]),
  'forehead-upper-right':    frozen([-0.286, 0.167, 0.782], [-0.062, -0.621, 0.781]),
  'forehead-upper-center':   frozen([-0.01, 0.157, 0.845], [-0.038, -0.304, 0.952]),
  'forehead-lower-left':     frozen([0.267, -0.194, 0.755], [0.394, 0.317, 0.863]),
  'forehead-lower-right':    frozen([-0.136, -0.206, 0.894], [-0.833, 0.461, 0.307]),
  'forehead-lower-center':   frozen([-0.003, -0.101, 0.969], [0.116, 0.627, 0.77]),
  'temple-left':             frozen([0.558, -0.246, 0.276], [0.984, -0.11, 0.142]),
  'temple-right':            frozen([-0.571, -0.242, 0.294], [-0.986, -0.118, 0.12]),
  'behind-eye-left':         frozen([0.264, -0.292, 0.782], [0.374, 0.125, 0.919]),
  'behind-eye-right':        frozen([-0.237, -0.333, 0.808], [-0.214, 0.144, 0.966]),
  'sinus-frontal-left':      frozen([0.112, -0.193, 0.883], [0.827, 0.507, 0.242]),
  'sinus-frontal-right':     frozen([-0.094, -0.137, 0.912], [-0.893, 0.379, 0.241]),
  'sinus-ethmoid':           frozen([-0.005, -0.302, 0.912], [-0.134, -0.456, 0.88]),
  'nose-bridge':             frozen([-0.011, -0.427, 0.929], [-0.01, -0.139, 0.99]),
  'sinus-maxillary-left':    frozen([0.342, -0.637, 0.703], [0.723, -0.313, 0.616]),
  'sinus-maxillary-right':   frozen([-0.315, -0.629, 0.743], [-0.638, -0.305, 0.707]),
  'cheek-left':              frozen([0.422, -0.676, 0.496], [0.905, -0.404, 0.132]),
  'cheek-right':             frozen([-0.472, -0.59, 0.495], [-0.912, -0.349, 0.218]),
  'tmj-left':                frozen([0.609, -0.394, 0.097], [0.255, -0.929, 0.268]),
  'tmj-right':               frozen([-0.52, -0.476, 0.141], [-0.938, -0.317, -0.137]),
  'jaw-angle-left':          frozen([0.443, -0.917, 0.072], [0.834, -0.097, 0.544]),
  'jaw-angle-right':         frozen([-0.43, -0.905, 0.086], [-0.827, -0.094, 0.554]),
  'chin':                    frozen([-0.027, -0.885, 0.77], [-0.087, -0.942, 0.325]),
  'upper-teeth-left':        frozen([0.161, -0.77, 0.839], [0.621, -0.149, 0.77]),
  'upper-teeth-right':       frozen([-0.122, -0.79, 0.852], [-0.54, -0.305, 0.785]),
  'ear-left':                frozen([0.695, -0.303, -0.031], [0.89, -0.44, 0.124]),
  'ear-right':               frozen([-0.654, -0.302, -0.027], [0.44, -0.448, -0.778]),
  'mastoid-left':            frozen([0.501, -0.489, -0.217], [0.911, -0.19, -0.366]),
  'mastoid-right':           frozen([-0.471, -0.485, -0.276], [-0.821, -0.221, -0.526]),
  'vertex-center':           frozen([0.009, 1, -0.093], [-0.003, 0.997, -0.071]),
  'vertex-left':             frozen([0.481, 0.806, -0.146], [0.674, 0.736, -0.06]),
  'vertex-right':            frozen([-0.409, 0.851, -0.134], [-0.606, 0.791, -0.085]),
  'parietal-left':           frozen([0.658, 0.228, -0.106], [0.987, -0.107, 0.123]),
  'parietal-right':          frozen([-0.646, 0.237, -0.092], [-0.993, -0.093, 0.073]),
  'occipital-upper-left':    frozen([0.39, 0.101, -0.765], [0.569, -0.103, -0.816]),
  'occipital-upper-right':   frozen([-0.348, 0.098, -0.751], [-0.632, -0.117, -0.766]),
  'occipital-upper-center':  frozen([0.005, 0.056, -0.875], [0, -0.162, -0.987]),
  'occipital-lower-left':    frozen([0.319, -0.283, -0.658], [0.48, -0.557, -0.677]),
  'occipital-lower-right':   frozen([-0.241, -0.282, -0.663], [-0.453, -0.59, -0.668]),
  'occipital-lower-center':  frozen([-0.014, -0.291, -0.728], [-0.073, -0.549, -0.832]),
  'suboccipital-left':       frozen([0.292, -0.718, -0.52], [0.757, 0.121, -0.642]),
  'suboccipital-right':      frozen([-0.267, -0.71, -0.555], [-0.682, 0.116, -0.722]),
  'neck-back-upper':         frozen([0.025, -1.081, -0.783], [0.037, 0.485, -0.874]),
  'neck-back-mid':           frozen([-0.033, -1.225, -0.856], [-0.036, 0.44, -0.897]),
  'neck-back-lower':         frozen([-0.032, -1.411, -0.94], [-0.021, 0.399, -0.917]),
  'neck-side-left':          frozen([0.475, -1.293, -0.031], [0.875, 0.049, 0.481]),
  'neck-side-right':         frozen([-0.446, -1.264, -0.011], [-0.859, 0.009, 0.511]),
  'throat-front':            frozen([0.01, -1.162, 0.343], [-0.019, -0.443, 0.896]),
  'trap-left':               frozen([0.932, -1.473, -0.277], [0.158, 0.748, 0.644]),
  'trap-right':              frozen([-0.761, -1.445, -0.234], [-0.357, 0.669, 0.652])
});

export const PRE_FIX_WHOLE_HEAD_SPOT = frozen([0, 0.2, 0.95], [0, 0, 1]);
