import { clamp } from './world.js';

// Game-tuned handling, in seconds and radians; not a measured firearm model.
export const createWeaponState = () => ({
  aim: 0, lowReady: 0, motion: 0, fatigue: 0, strain: 0,
  recoilPitch: 0, recoilYaw: 0, swayPitch: 0, swayYaw: 0,
  sinceShot: 10, phase: 0, stepPhase: 0, eye: 1.68, spread: .016,
});
const approach = (value, target, rate, dt) => target + (value - target) * Math.exp(-rate * dt);

export function updateWeapon(p, dt) {
  const w = p.weapon;
  w.phase += dt; w.sinceShot += dt;
  w.lowReady = p.sprint ? .3 : Math.max(0, w.lowReady - dt);
  const canAim = p.aim && !w.lowReady && !p.reload && !p.heal;
  w.aim = clamp(w.aim + (canAim ? dt / .32 : -dt / .18), 0, 1);
  w.motion = approach(w.motion, p.moving ? 1 : 0, p.moving ? 9 : 5, dt);
  w.fatigue = approach(w.fatigue, 1 - p.stamina / 100, 1.2, dt);
  w.strain = Math.max(0, w.strain - dt * (w.sinceShot > .2 ? 1.5 : .18));
  // Small kicks accumulate in a burst; releasing the trigger lets the rifle settle.
  const recovery = w.sinceShot > .08 ? 5.5 : 1.5;
  w.recoilPitch = approach(w.recoilPitch, 0, recovery, dt);
  w.recoilYaw = approach(w.recoilYaw, 0, recovery, dt);
  const support = p.crouch ? .6 : 1;
  const breath = (.0008 + w.fatigue * .0045) * support;
  w.stepPhase += dt * (p.moving ? (p.sprint ? 15 : 9) : 0);
  w.swayPitch = Math.sin(w.phase * 1.9) * breath + Math.sin(w.stepPhase) * .0035 * w.motion * support;
  w.swayYaw = Math.sin(w.phase * 1.25 + .7) * breath * .8 + Math.sin(w.stepPhase * .5) * .003 * w.motion * support;
  w.spread = (.016 * (1 - w.aim) + .0012 * w.aim + w.motion * .009 + w.fatigue * .0015 + w.strain * .002) * support;
  const bob = Math.sin(w.stepPhase) * w.motion * (p.sprint ? .043 : .023 - w.aim * .015);
  w.eye = approach(w.eye, (p.crouch ? 1.02 : 1.68) + bob, 14, dt);
}

// Rendering and shot rays share this orientation, including visible sway/recoil.
export function weaponOrientation(p) {
  return { pitch: clamp(p.pitch + p.weapon.recoilPitch + p.weapon.swayPitch, -1.48, 1.48), yaw: p.yaw + p.weapon.recoilYaw + p.weapon.swayYaw };
}
export function shotDirection(p, random) {
  const orientation = weaponOrientation(p);
  const radius = Math.sqrt(random()) * p.weapon.spread, angle = random() * Math.PI * 2;
  const pitch = orientation.pitch + Math.sin(angle) * radius, yaw = orientation.yaw + Math.cos(angle) * radius;
  return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
}
export function kickWeapon(p, random) {
  const w = p.weapon, support = p.crouch ? .75 : 1;
  w.recoilPitch = Math.min(.18, w.recoilPitch + (.017 - w.aim * .006) * (1 + w.strain * .65) * support);
  w.recoilYaw = clamp(w.recoilYaw + (random() - .5) * .009 * support, -.045, .045);
  w.strain = Math.min(1, w.strain + .18); w.sinceShot = 0;
}

export function handlingLabel(p) {
  const w = p.weapon;
  if (p.reload) return 'RELOADING';
  if (p.heal) return 'TREATING INJURY';
  if (w.lowReady) return 'LOW READY';
  if (w.aim < .98) return p.aim ? 'RAISING SIGHTS' : 'HIP FIRE';
  if (w.motion > .15) return 'MOVING';
  if (w.fatigue > .4) return 'HEAVY BREATHING';
  if (w.strain > .15 || w.recoilPitch > .003) return 'SETTLING';
  return p.crouch ? 'STEADY / CROUCHED' : 'STEADY';
}
