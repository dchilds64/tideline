import { SOLIDS, blocked, dist, findPath, moveBody, visible } from './world.js';

// Cover is inferred from the same geometry that stops bullets. No authored
// "safe" markers: a position must actually occlude the remembered threat.
const spots = [];
for (const solid of SOLIDS) {
  for (const [nx, nz, extent, width] of [[1, 0, solid.w / 2, solid.d], [-1, 0, solid.w / 2, solid.d], [0, 1, solid.d / 2, solid.w], [0, -1, solid.d / 2, solid.w]]) {
    const tx = -nz, tz = nx;
    for (const offset of [0, -Math.max(0, width / 2 - .75), Math.max(0, width / 2 - .75)]) {
      const hide = { x: solid.x + nx * (extent + .65) + tx * offset, z: solid.z + nz * (extent + .65) + tz * offset };
      if (blocked(hide.x, hide.z, .43)) continue;
      // Low cover permits standing up in place; tall cover requires a side peek.
      const peeks = [{ ...hide }];
      for (const sign of [-1, 1]) {
        const peek = { x: solid.x + nx * (extent + .65) + tx * sign * (width / 2 + .7), z: solid.z + nz * (extent + .65) + tz * sign * (width / 2 + .7) };
        if (dist(hide, peek) < 2.1 && !blocked(peek.x, peek.z, .43)) peeks.push(peek);
      }
      spots.push({ solid: solid.id, hide, peeks });
    }
  }
}

export function protects(hide, threat) {
  return !visible(threat, hide, threat.crouch ? 1.02 : 1.6, 1.02);
}

function canStepBetween(from, to) {
  const body = { ...from }, distance = dist(from, to);
  for (let i = 0; i < Math.ceil(distance / .1); i++) {
    const d = dist(body, to); if (d < .01) break;
    const step = Math.min(.1, d);
    moveBody(body, (to.x - body.x) / d * step, (to.z - body.z) / d * step, .43);
  }
  return dist(body, to) < .05;
}

/** Choose a nearby reachable hide/peek pair using a remembered contact only. */
export function chooseCover(actor, threat, reserved = []) {
  if (!threat) return null;
  const candidates = [];
  for (const spot of spots) {
    const travel = dist(actor, spot.hide);
    if (travel > 9 || dist(spot.hide, threat) < 4 || reserved.some(p => dist(p, spot.hide) < 1.6) || !protects(spot.hide, threat)) continue;
    for (const peek of spot.peeks) {
      if (!visible(peek, threat, 1.4, threat.crouch ? .78 : 1.2) || !canStepBetween(spot.hide, peek)) continue;
      candidates.push({ hide: spot.hide, peek, solid: spot.solid, score: travel + dist(spot.hide, peek) * .6 });
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  // Avoid an expensive global path search for every potential cover point.
  let best = null, bestScore = Infinity;
  for (const candidate of candidates.slice(0, 6)) {
    const path = findPath(actor, candidate.hide);
    if (!path.length || dist(path.at(-1), candidate.hide) > .1) continue;
    let length = 0, exposed = 0, previous = actor;
    for (const point of path) {
      const segment = dist(previous, point); length += segment;
      if (visible(threat, point, threat.crouch ? 1.02 : 1.6, 1.2)) exposed += segment;
      previous = point;
    }
    const score = length + exposed * .3 + dist(candidate.hide, candidate.peek) * .6;
    if (length <= 13 && score < bestScore) { bestScore = score; best = { hide: { ...candidate.hide }, peek: { ...candidate.peek }, solid: candidate.solid }; }
  }
  return best;
}
