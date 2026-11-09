export const BOUNDS = { minX: -35, maxX: 35, minZ: -33, maxZ: 40 };
export const START = { x: -3, z: 31 };
export const EXTRACT = { x: 26, z: 29 };
export const HOSTAGE = { x: 10, z: -9 };
// A single geometry source drives visuals, movement, ballistics, vision, and navigation.
export const SOLIDS = [];
const box = (id, x, z, w, d, h, kind = 'wall') => SOLIDS.push({ id, x, z, w, d, h, kind });
box('south-west', -10.5, 15, 15, .55, 2.7);
box('south-east', 10.5, 15, 15, .55, 2.7);
box('west-north', -18, -6, .55, 20, 2.7);
box('west-south', -18, 12, .55, 6, 2.7);
box('east-north', 18, -6, .55, 20, 2.7);
box('east-south', 18, 12, .55, 6, 2.7);
box('north', 0, -16, 36, .55, 2.7);
// Holding building: open south doorway, no invisible roof collision.
box('holding-north', 9, -12, 12, .35, 3.5, 'building');
box('holding-west', 3, -7, .35, 10, 3.5, 'building');
box('holding-east', 15, -7, .35, 10, 3.5, 'building');
box('holding-front-left', 5, -2, 4, .35, 3.5, 'building');
box('holding-front-right', 13, -2, 4, .35, 3.5, 'building');
box('holding-partition', 7, -9.5, .25, 5, 3, 'building');
// Western warehouse offers an alternate route through its two doors.
box('store-north', -8, -11, 12, .35, 3.6, 'building');
box('store-west', -14, -5, .35, 12, 3.6, 'building');
box('store-east-north', -2, -9, .35, 4, 3.6, 'building');
box('store-east-south', -2, -1, .35, 4, 3.6, 'building');
box('store-front-left', -12.5, 1, 3, .35, 3.6, 'building');
box('store-front-right', -5, 1, 6, .35, 3.6, 'building');
box('storage-a', -10, -7, 3, 2, 1.5, 'crate');
box('storage-b', -6, -8.5, 2, 2, 1.1, 'crate');
box('courtyard-a', 4, 7, 4.5, 1.4, 1.15, 'sandbag');
box('courtyard-b', -7, 7, 3, 2, 1.3, 'crate');
box('courtyard-c', 12, 9, 2.5, 4, 1.5, 'crate');
box('generator', 13, -14, 3, 1.6, 1.5, 'machine');
box('approach-west', -9, 22, 4, 2.4, 1.1, 'rock');
box('approach-east', 8, 23, 4, 2, 1.05, 'rock');
box('flank-west', -23, 8, 3, 5, 1.3, 'rock');
box('flank-east', 23, 10, 3, 3, 1.4, 'rock');
box('north-rock', -22, -21, 8, 3, 2.4, 'rock');
box('beach-rock', -19, 32, 6, 4, 1.6, 'rock');

export const PATROLS = [
  [{ x: -1, z: 11 }, { x: 7, z: 11 }],
  [{ x: -15, z: 6 }, { x: -21, z: 6 }, { x: -21, z: 17 }],
  [{ x: 20, z: 6 }, { x: 20, z: 18 }],
  [{ x: 0, z: 0 }, { x: 0, z: -10 }],
  [{ x: -8, z: -3 }, { x: -5, z: -6 }],
  [{ x: 10, z: -5 }, { x: 12, z: -9 }],
  [{ x: 7, z: -14 }, { x: -9, z: -14 }],
];

export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export function blocked(x, z, radius = .32) {
  if (x < BOUNDS.minX + radius || x > BOUNDS.maxX - radius || z < BOUNDS.minZ + radius || z > BOUNDS.maxZ - radius) return true;
  return SOLIDS.some(b => {
    const nx = clamp(x, b.x - b.w / 2, b.x + b.w / 2);
    const nz = clamp(z, b.z - b.d / 2, b.z + b.d / 2);
    return Math.hypot(x - nx, z - nz) < radius;
  });
}
export function moveBody(body, dx, dz, radius = .32) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .18));
  for (let i = 0; i < steps; i++) {
    if (!blocked(body.x + dx / steps, body.z, radius)) body.x += dx / steps;
    if (!blocked(body.x, body.z + dz / steps, radius)) body.z += dz / steps;
  }
}
export function rayBox(origin, direction, b, max = Infinity) {
  let near = 0, far = max;
  for (const [axis, lo, hi] of [['x', b.x - b.w / 2, b.x + b.w / 2], ['y', 0, b.h], ['z', b.z - b.d / 2, b.z + b.d / 2]]) {
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < lo || origin[axis] > hi) return Infinity;
    } else {
      let a = (lo - origin[axis]) / direction[axis], c = (hi - origin[axis]) / direction[axis];
      if (a > c) [a, c] = [c, a];
      near = Math.max(near, a); far = Math.min(far, c);
      if (near > far) return Infinity;
    }
  }
  return near;
}
export function wallDistance(origin, direction, max = 100) {
  const ground = direction.y < -1e-8 ? Math.max(0, -origin.y / direction.y) : max;
  return SOLIDS.reduce((d, b) => Math.min(d, rayBox(origin, direction, b, max)), Math.min(max, ground));
}
// Shot presentation uses the same collision boxes as ballistics. Return the
// struck face as well as range; a miss must never create a floating decal.
export function surfaceHit(origin, direction, max = 85) {
  let distance = max, solid = null, ground = false;
  if (direction.y < -1e-8) {
    const t = -origin.y / direction.y;
    if (t >= 0 && t < distance) { distance = t; ground = true; }
  }
  for (const box of SOLIDS) {
    const t = rayBox(origin, direction, box, max);
    if (t < distance) { distance = t; solid = box; ground = false; }
  }
  if (!solid && !ground) return null;
  const point = Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, origin[axis] + direction[axis] * distance]));
  let normal = { x: 0, y: 1, z: 0 }, margin = Infinity;
  if (solid) {
    const bounds = { x: [solid.x - solid.w / 2, solid.x + solid.w / 2], y: [0, solid.h], z: [solid.z - solid.d / 2, solid.z + solid.d / 2] };
    let closest = Infinity, face;
    for (const axis of ['x', 'y', 'z']) for (const side of [0, 1]) {
      const delta = Math.abs(point[axis] - bounds[axis][side]);
      if (delta < closest) { closest = delta; face = axis; normal = { x: 0, y: 0, z: 0 }; normal[axis] = side ? 1 : -1; }
    }
    margin = Math.min(...Object.keys(bounds).filter(axis => axis !== face).flatMap(axis => [point[axis] - bounds[axis][0], bounds[axis][1] - point[axis]]));
  }
  const interior = !solid && ((point.x > 3 && point.x < 15 && point.z > -12 && point.z < -2) || (point.x > -14 && point.x < -2 && point.z > -11 && point.z < 1));
  const surface = solid ? ({ crate: 'wood', machine: 'metal', sandbag: 'sand', rock: 'stone' }[solid.kind] || 'concrete') : interior ? 'concrete' : 'sand';
  // Irregular rocks and sacks don't match their box precisely: use debris only.
  return { distance, point, normal, surface, margin, decal: !solid || !['rock', 'sandbag'].includes(solid.kind), solidId: solid?.id || 'ground' };
}
export function visible(a, b, ay = 1.55, by = 1.25) {
  const length = Math.hypot(b.x - a.x, b.z - a.z, by - ay);
  if (length < .01) return true;
  return wallDistance({ x: a.x, y: ay, z: a.z }, { x: (b.x - a.x) / length, y: (by - ay) / length, z: (b.z - a.z) / length }, length) >= length - .03;
}

const STEP = .8;
const NX = Math.floor((BOUNDS.maxX - BOUNDS.minX) / STEP) + 1;
const NZ = Math.floor((BOUNDS.maxZ - BOUNDS.minZ) / STEP) + 1;
const grid = new Uint8Array(NX * NZ);
const cellPos = id => ({ x: BOUNDS.minX + (id % NX) * STEP, z: BOUNDS.minZ + Math.floor(id / NX) * STEP });
for (let id = 0; id < grid.length; id++) { const p = cellPos(id); grid[id] = blocked(p.x, p.z, .43) ? 1 : 0; }
function nearest(p) {
  const gx = clamp(Math.round((p.x - BOUNDS.minX) / STEP), 0, NX - 1);
  const gz = clamp(Math.round((p.z - BOUNDS.minZ) / STEP), 0, NZ - 1);
  let best = -1, d = Infinity;
  for (let oz = -4; oz <= 4; oz++) for (let ox = -4; ox <= 4; ox++) {
    const x = gx + ox, z = gz + oz, id = x + z * NX;
    if (x < 0 || z < 0 || x >= NX || z >= NZ || grid[id]) continue;
    const dd = dist(p, cellPos(id)); if (dd < d) { best = id; d = dd; }
  }
  return best;
}
// A* on an inflated occupancy grid. Diagonals may not cut corners.
export function findPath(from, to) {
  const start = nearest(from), goal = nearest(to);
  if (start < 0 || goal < 0) return [];
  const cost = new Float32Array(grid.length).fill(Infinity), parent = new Int32Array(grid.length).fill(-1);
  const closed = new Uint8Array(grid.length), open = [start]; cost[start] = 0;
  const gp = cellPos(goal);
  let count = 0;
  while (open.length && count++ < 10000) {
    let index = 0, score = Infinity;
    for (let i = 0; i < open.length; i++) { const s = cost[open[i]] + dist(cellPos(open[i]), gp); if (s < score) { score = s; index = i; } }
    const id = open.splice(index, 1)[0];
    if (id === goal) {
      const path = []; let at = id;
      while (at !== start && at >= 0) { path.push(cellPos(at)); at = parent[at]; }
      path.reverse();
      if (!blocked(to.x, to.z, .43)) path.push({ x: to.x, z: to.z });
      return path;
    }
    closed[id] = 1;
    const x = id % NX, z = Math.floor(id / NX);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const xx = x + dx, zz = z + dz, next = xx + zz * NX;
      if (xx < 0 || zz < 0 || xx >= NX || zz >= NZ || grid[next] || closed[next]) continue;
      if (dx && dz && (grid[id + dx] || grid[id + dz * NX])) continue;
      const value = cost[id] + STEP * (dx && dz ? Math.SQRT2 : 1);
      if (value < cost[next]) { parent[next] = id; cost[next] = value; if (!open.includes(next)) open.push(next); }
    }
  }
  return [];
}
