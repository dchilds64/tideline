// Presentation only: navigation, detection and hit volumes remain simulation-owned.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const damp = (a, b, rate, dt) => mix(a, b, 1 - Math.exp(-rate * dt));
export const angleDifference = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const length = v => Math.hypot(...v);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const scale = (v, s) => v.map(n => n * s);
const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);

// Analytic two-segment limb, with an explicit bend direction. Clamp unreachable
// goals instead of stretching bones or letting zero-length poses produce NaNs.
export function solveLimb(start, goal, upperLength, lowerLength, pole = [0, 0, -1]) {
  const delta = sub(goal, start), distance = length(delta);
  const direction = distance > 1e-7 ? scale(delta, 1 / distance) : [0, -1, 0];
  const reach = clamp(distance, Math.abs(upperLength - lowerLength) + 1e-5, upperLength + lowerLength - 1e-5);
  let bend = sub(pole, scale(direction, dot(pole, direction)));
  if (length(bend) < 1e-6) {
    const alternate = Math.abs(direction[0]) < .8 ? [1, 0, 0] : [0, 1, 0];
    bend = sub(alternate, scale(direction, dot(alternate, direction)));
  }
  bend = scale(bend, 1 / length(bend));
  const along = (upperLength ** 2 - lowerLength ** 2 + reach ** 2) / (2 * reach);
  const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  return { joint: add(start, add(scale(direction, along), scale(bend, height))), end: add(start, scale(direction, reach)) };
}

function homeFoot(actor, yaw, side) {
  return { x: actor.x + Math.cos(yaw) * side * .15, z: actor.z - Math.sin(yaw) * side * .15 };
}
export function createActorMotion(actor) {
  const yaw = actor.yaw || 0;
  return { x: actor.x, z: actor.z, yaw, speed: 0, crouch: actor.crouch ? 1 : 0, distance: 0, nextFoot: actor.id?.endsWith('1') ? 1 : 0, recoil: 0, ready: 0, fall: actor.hp <= 0 ? 1 : 0,
    hip: actor.crouch ? .43 : .95, bob: 0, chestYaw: 0, localFeet: [[-.15, .11, 0], [.15, .11, 0]],
    feet: [-1, 1].map(side => { const home = homeFoot(actor, yaw, side); return { ...home, y: .11, from: { ...home }, to: { ...home }, progress: 1, duration: .2 }; }),
  };
}

export function updateActorMotion(state, actor, dt, time) {
  // Paused frames must not continue stepping, turning or finishing a reload pose.
  if (dt <= 0) return state;
  dt = Math.min(dt, .05);
  const dx = actor.x - state.x, dz = actor.z - state.z, travelled = Math.hypot(dx, dz);
  if (travelled > 2) Object.assign(state, createActorMotion(actor));
  const actualSpeed = travelled > 2 ? 0 : travelled / dt;
  state.speed = damp(state.speed, actualSpeed, 12, dt);
  state.distance += travelled > 2 ? 0 : travelled;
  state.crouch = damp(state.crouch, actor.crouch ? 1 : 0, 15, dt);
  state.ready = damp(state.ready, actor.aimUntil > time ? 1 : 0, 12, dt);
  state.recoil = Math.max(0, state.recoil - dt * 9);
  state.fall = damp(state.fall, actor.hp <= 0 ? 1 : 0, 8, dt);
  const turn = angleDifference(state.yaw, actor.yaw || 0);
  state.yaw += clamp(turn, -dt * 4.8, dt * 4.8);
  state.chestYaw = clamp(angleDifference(state.yaw, actor.yaw || 0), -.85, .85);
  const vx = actualSpeed > .05 && travelled < 2 ? dx / dt : 0, vz = actualSpeed > .05 && travelled < 2 ? dz / dt : 0;
  const speed = Math.hypot(vx, vz), cadence = Math.max(speed, state.speed);
  const lead = Math.min(.4, cadence * .11);
  const goals = [-1, 1].map(side => {
    const home = homeFoot(actor, state.yaw, side);
    return { x: home.x + (speed ? vx / speed * lead : 0), z: home.z + (speed ? vz / speed * lead : 0) };
  });
  state.feet.forEach(foot => {
    if (foot.progress >= 1) return;
    foot.progress = Math.min(1, foot.progress + dt / foot.duration);
    const t = foot.progress, eased = t * t * (3 - 2 * t);
    foot.x = mix(foot.from.x, foot.to.x, eased); foot.z = mix(foot.from.z, foot.to.z, eased);
    foot.y = .11 + Math.sin(Math.PI * t) * (state.crouch > .5 ? .065 : .1 + Math.min(.08, state.speed * .015));
    if (t === 1) foot.y = .11;
  });
  if (actor.hp > 0) {
    const distances = state.feet.map((f, i) => Math.hypot(f.x - goals[i].x, f.z - goals[i].z));
    const threshold = speed > .1 ? mix(.28, .18, state.crouch) : .14;
    let next = state.nextFoot;
    if (distances[next] <= threshold) next = 1 - next;
    const foot = state.feet[next], other = state.feet[1 - next];
    const urgent = distances[next] > .6;
    if (foot.progress === 1 && distances[next] > threshold && (other.progress === 1 || urgent)) {
      foot.from = { x: foot.x, z: foot.z }; foot.to = goals[next]; foot.progress = 0;
      foot.duration = clamp(.23 - cadence * .027, .08, .23);
      state.nextFoot = 1 - next;
    }
  }
  state.x = actor.x; state.z = actor.z;
  const c = Math.cos(state.yaw), s = Math.sin(state.yaw);
  state.localFeet = state.feet.map(foot => {
    const x = foot.x - actor.x, z = foot.z - actor.z;
    return [c * x - s * z, foot.y, s * x + c * z];
  });
  // Lower the pelvis as the stance widens; feet stay planted instead of skating.
  let hip = mix(.95, .43, state.crouch);
  state.localFeet.forEach((f, i) => {
    const horizontal = Math.hypot(f[0] - (i ? .15 : -.15), f[2]);
    hip = Math.min(hip, f[1] + Math.sqrt(Math.max(.3 ** 2, .845 ** 2 - horizontal ** 2)));
  });
  state.hip = clamp(hip, state.crouch > .5 ? .35 : .58, .95);
  state.bob = (state.hip - mix(.95, .43, state.crouch)) * .5 + Math.sin(time * 2.1 + (actor.id?.endsWith('1') ? 2 : 0)) * .003;
  return state;
}
