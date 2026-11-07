import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { chooseCover, protects } from '../src/cover.js';
import { weaponOrientation, shotDirection } from '../src/weapon.js';
import { createActorMotion, updateActorMotion, solveLimb, angleDifference } from '../src/animation.js';
import { createActorRig, animateActorRig } from '../src/actor-view.js';
import { GameView } from '../src/render.js';
import { OperatorLibrary, createOperator, operatorClip } from '../src/operators.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { readFile } from 'node:fs/promises';
import { PerspectiveCamera, Vector3, Scene, MeshStandardMaterial } from 'three';
import { SOLIDS, EXTRACT, HOSTAGE, blocked, moveBody, visible, findPath, dist } from '../src/world.js';

const advance = (sim, seconds, input = {}) => { for (let t = 0; t < seconds; t += .05) sim.tick(.05, input); };
const safeSim = () => { const sim = new Simulation(() => .5); sim.start(); sim.enemies.forEach(e => e.hp = 0); return sim; };

async function operatorFixture() {
  // The production GLB's geometry, joints and clips are parsed unchanged. Only
  // image decoding is omitted for the Node test process, which has no DOM.
  globalThis.ProgressEvent ??= class extends Event { constructor(type, fields = {}) { super(type); Object.assign(this, fields); } };
  const bytes = await readFile(new URL('../public/models/operator.glb', import.meta.url)), length = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + length));
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + length).toString('base64')}`;
  json.materials = json.materials.map(m => ({ name: m.name })); delete json.images; delete json.textures;
  const asset = await new GLTFLoader().parseAsync(JSON.stringify(json), '');
  const view = Object.create(GameView.prototype); view.scene = new Scene();
  view.surfaces = { fabric: color => new MeshStandardMaterial({ color }) };
  return { asset, view };
}

test('imported operators animate independently and dispose without releasing shared geometry', async () => {
  const { asset, view } = await operatorFixture(), actor = { id: 'friend-0', type: 'friend', x: 0, z: 0, yaw: 0, hp: 100 };
  const first = createOperator(view, actor, asset), second = createOperator(view, { ...actor, id: 'friend-1' }, asset);
  assert.notEqual(first.userData.bones.get('Hips'), second.userData.bones.get('Hips'));
  let shared; asset.scene.traverse(o => { if (o.isMesh) shared = o.geometry; });
  let disposed = false; shared.addEventListener('dispose', () => { disposed = true; });
  for (let i = 0; i < 60; i++) { actor.z -= .035; animateActorRig(first, actor, 1 / 60, i / 60); }
  assert.equal(first.userData.activeClip, 'ready_walk'); assert.equal(second.userData.activeClip, 'ready_idle');
  assert.notEqual(first.userData.mixer.time, second.userData.mixer.time);
  const before = first.userData.mixer.time; animateActorRig(first, actor, 0, 1); assert.equal(first.userData.mixer.time, before);
  first.userData.dispose(); assert.equal(disposed, false, 'another actor still owns a reference to shared geometry');
  animateActorRig(second, { ...actor, hp: 100 }, .05, 2); second.userData.dispose();
});

test('real skinned operator retains usable grips, crouch height and death/revive transitions', async () => {
  const { asset, view } = await operatorFixture(), actor = { id: 'enemy-0', type: 'enemy', x: 0, z: 0, yaw: 0, hp: 100, aimUntil: 20 };
  const root = createOperator(view, actor, asset), rig = root.userData;
  for (const crouch of [false, true]) {
    actor.crouch = crouch;
    for (let i = 0; i < 60; i++) animateActorRig(root, actor, 1 / 60, i / 60 + 1);
    for (const [side, y, z] of [['Right', -.095, -.01], ['Left', -.025, -.25]]) {
      const target = new Vector3(0, y, z).applyMatrix4(rig.weapon.rifle.matrix); target.z += .035;
      const actual = root.worldToLocal(rig.bones.get(`${side}Hand`).getWorldPosition(new Vector3()));
      assert.ok(actual.distanceTo(target) < .015, `${side} wrist reaches the grip (crouch=${crouch}, error=${actual.distanceTo(target).toFixed(3)}, actual=${actual.toArray()}, goal=${target.toArray()})`);
    }
    const head = rig.bones.get('Head').getWorldPosition(new Vector3());
    assert.ok(head.y > (crouch ? .85 : 1.4) && head.y < (crouch ? 1.2 : 1.8));
    for (const side of ['Left', 'Right']) assert.ok(Math.abs(rig.bones.get(`${side}Foot`).getWorldPosition(new Vector3()).y - .13) < .025, 'stationary stance keeps both boots grounded');
    root.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
  }
  actor.hp = 0;
  for (let i = 0; i < 90; i++) animateActorRig(root, actor, .05, 3 + i * .05);
  assert.equal(rig.activeClip, 'death'); assert.ok(rig.bones.get('Head').getWorldPosition(new Vector3()).y < .6);
  actor.hp = 50; actor.crouch = false;
  for (let i = 0; i < 30; i++) animateActorRig(root, actor, .05, 8 + i * .05);
  assert.equal(rig.activeClip, 'aim_idle'); assert.ok(rig.bones.get('Head').getWorldPosition(new Vector3()).y > 1.4);
  rig.dispose();
});

test('missing or invalid character asset leaves procedural fallback available', async t => {
  t.mock.method(console, 'warn', () => {});
  for (const loader of [{ loadAsync: async () => { throw new Error('missing'); } }, { loadAsync: async () => ({ animations: [], scene: new Scene() }) }]) {
    const library = new OperatorLibrary(loader); assert.deepEqual(await library.ready, ['operator model']);
    assert.equal(library.create({}, { type: 'friend' }), null);
  }
  assert.equal(operatorClip({ hp: 100, crouch: true, aimUntil: 5 }, 0, 2), 'aim_crouch_idle');
  assert.equal(operatorClip({ hp: 100, aimUntil: 1 }, 3.2, 2), 'ready_run');
});

test('two-bone poses preserve limb lengths for reachable, unreachable and degenerate goals', () => {
  const start = [.15, .8, 0];
  for (const goal of [[.15, .11, -.3], [2, 0, 0], start, [.15, .8, -1]]) {
    const pose = solveLimb(start, goal, .43, .43);
    const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
    assert.ok([...pose.joint, ...pose.end].every(Number.isFinite));
    assert.ok(Math.abs(distance(start, pose.joint) - .43) < 1e-8);
    assert.ok(Math.abs(distance(pose.joint, pose.end) - .43) < 1e-8);
    if (distance(start, goal) < .86 && distance(start, goal) > .00001) assert.ok(distance(pose.end, goal) < 1e-8);
  }
});

test('feet stay anchored during stance and remain reachable from walk through sprint at 20 and 60 fps', () => {
  for (const dt of [1 / 60, .05]) for (const speed of [1.8, 3.3, 5.4]) {
    const actor = { id: 'friend-0', x: 0, z: 0, yaw: 0, hp: 100 }, motion = createActorMotion(actor);
    let plantedFrames = 0;
    for (let time = 0; time < 5; time += dt) {
      const before = motion.feet.map(f => ({ ...f })); actor.z -= speed * dt;
      updateActorMotion(motion, actor, dt, time);
      motion.feet.forEach((foot, i) => {
        if (before[i].progress === 1 && foot.progress === 1) {
          assert.equal(foot.x, before[i].x); assert.equal(foot.z, before[i].z); plantedFrames++;
        }
        const target = motion.localFeet[i], pose = solveLimb([i ? .15 : -.15, motion.hip, 0], target, .43, .43);
        assert.ok(Math.hypot(...target.map((v, j) => v - pose.end[j])) < .001, 'foot must reach its ground anchor');
      });
    }
    assert.ok(plantedFrames > 0);
    for (let t = 0; t < 2; t += dt) updateActorMotion(motion, actor, dt, 5 + t);
    assert.ok(motion.feet.every(f => f.progress === 1), 'stopping settles both feet');
    const feet = JSON.stringify(motion.feet);
    for (let t = 0; t < 1; t += dt) updateActorMotion(motion, actor, dt, 7 + t);
    assert.equal(JSON.stringify(motion.feet), feet, 'idle operators do not march in place');
  }
});

test('actor presentation freezes on pause, turns by the shortest arc and resets after repositioning', () => {
  const actor = { id: 'friend-1', x: 0, z: 0, yaw: Math.PI - .02, hp: 100 }, motion = createActorMotion(actor);
  const before = JSON.stringify(motion); actor.crouch = true; actor.yaw = -Math.PI + .02;
  updateActorMotion(motion, actor, 0, 1); assert.equal(JSON.stringify(motion), before);
  updateActorMotion(motion, actor, .05, 1);
  assert.ok(Math.abs(angleDifference(motion.yaw, actor.yaw)) < .001);
  for (let t = 0; t < 1; t += .05) updateActorMotion(motion, actor, .05, t + 1);
  assert.ok(motion.crouch > .999 && motion.hip < .44);
  actor.x = 20; updateActorMotion(motion, actor, .05, 3);
  assert.ok(motion.feet.every(f => Math.abs(f.x - actor.x) < .2));
  assert.ok(motion.localFeet.flat().every(Number.isFinite));
});

test('rendered hands stay on weapon grips and crouched head matches the hit volume', () => {
  // Exercise the production geometry without constructing a WebGL renderer.
  const view = Object.create(GameView.prototype); view.scene = new Scene();
  view.surfaces = { fabric: color => new MeshStandardMaterial({ color }) };
  const actor = { id: 'friend-0', type: 'friend', x: 0, z: 0, yaw: 0, hp: 100, aimUntil: 10 };
  const root = createActorRig(view, actor), rig = root.userData;
  for (const crouch of [false, true]) for (const aim of [false, true]) for (const reload of [0, 2.8, 2, 1, .2]) {
    actor.crouch = crouch; actor.aimUntil = aim ? 10 : 0; actor.reload = reload;
    for (let i = 0; i < 60; i++) animateActorRig(root, actor, 1 / 60, 2 + i / 60);
    const grip = new Vector3(0, -.095, -.01).applyMatrix4(rig.rifle.matrix);
    assert.ok(rig.arms[1].hand.position.distanceTo(grip) < .001, 'firing hand remains attached during transitions and reload');
    if (!reload) {
      const support = new Vector3(0, -.025, -.34).applyMatrix4(rig.rifle.matrix);
      assert.ok(rig.arms[0].hand.position.distanceTo(support) < .001, 'support hand reaches fore-end');
    }
    const headHeight = 1.67 + rig.upper.position.y;
    assert.ok(Math.abs(headHeight - (crouch ? 1.02 : 1.65)) < .05);
  }
  rig.motion.recoil = 1; animateActorRig(root, actor, .05, 3);
  assert.equal(rig.flash.visible, true, 'a shot remains visible for one frame even at 20 fps');
  for (let i = 0; i < 5; i++) animateActorRig(root, actor, .05, 3 + i * .05);
  assert.equal(rig.flash.visible, false);
  root.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
});

test('compound entrances and holding room are reachable without clipping', () => {
  for (const from of [{ x: -3, z: 31 }, { x: -21, z: 6 }, { x: 22, z: 6 }]) {
    const path = findPath(from, HOSTAGE); assert.ok(path.length > 0);
    const body = { ...from };
    for (const p of path) {
      for (let i = 0; dist(body, p) > .06 && i < 200; i++) {
        const d = dist(body, p), step = Math.min(.06, d); moveBody(body, (p.x - body.x) / d * step, (p.z - body.z) / d * step);
        assert.equal(blocked(body.x, body.z, .3), false);
      }
      assert.ok(dist(body, p) < .07, 'navigation waypoint can be followed physically');
    }
    assert.ok(dist(body, HOSTAGE) < .1);
  }
});
test('solid walls stop bodies and sight, open entrance admits sight', () => {
  const body = { x: 7, z: 16 }; moveBody(body, 0, -8); assert.ok(body.z > 15.5);
  assert.equal(visible({ x: 7, z: 17 }, { x: 7, z: 12 }), false);
  assert.equal(visible({ x: 0, z: 17 }, { x: 0, z: 12 }), true);
});
test('hitscan resolves nearest targets and does not shoot through walls', () => {
  const sim = new Simulation(() => .5); sim.start(); sim.player.x = 0; sim.player.z = 20;
  sim.enemies.forEach(e => e.hp = 0); const enemy = sim.enemies[0]; Object.assign(enemy, { x: 0, z: 10, hp: 68 });
  sim.shoot({ x: 0, y: 0, z: -1 }); assert.equal(enemy.hp, 0); assert.equal(sim.player.ammo, 29);
  Object.assign(enemy, { x: 7, z: 10, hp: 68 }); sim.player.x = 7; sim.player.cooldown = 0;
  sim.shoot({ x: 0, y: 0, z: -1 }); assert.equal(enemy.hp, 68);
  sim.player.cooldown = 0; sim.events = [];
  sim.shoot({ x: 0, y: -1, z: 0 });
  assert.ok(sim.events.some(event => event.type === 'impact' && Math.abs(event.point.y) < .001), 'ground shots produce an impact');
});
test('reload consumes reserve only on completion and prevents firing', () => {
  const sim = safeSim(); sim.player.ammo = 3; sim.player.reserve = 12; sim.reload();
  assert.equal(sim.shoot({ x: 0, y: 0, z: -1 }), false); advance(sim, 1); assert.equal(sim.player.ammo, 3);
  advance(sim, 1.5); assert.equal(sim.player.ammo, 15); assert.equal(sim.player.reserve, 0);
});
test('enemies hear running, lose sight behind cover, and search last known position', () => {
  const sim = new Simulation(() => .99); sim.start(); sim.friends.forEach(f => f.hp = 0); sim.enemies.slice(1).forEach(e => e.hp = 0);
  const e = sim.enemies[0]; Object.assign(e, { x: 0, z: 10, yaw: Math.PI, state: 'patrol' });
  Object.assign(sim.player, { x: 0, z: 20 }); advance(sim, 1.5); assert.equal(e.state, 'combat');
  const lastSeen = { ...e.lastSeen }; Object.assign(sim.player, { x: 10, z: 20 }); sim.tick(.05);
  assert.ok(e.state === 'search' || (e.state === 'combat' && e.cover), 'lost contact searches or keeps watching from cover'); assert.deepEqual(e.lastSeen, lastSeen);
  assert.notDeepEqual(e.lastSeen, { x: sim.player.x, z: sim.player.z });
  e.state = 'patrol'; e.memory = 0; e.cover = null; sim.noise({ x: 2, z: 16 }, 13); sim.tick(.05);
  assert.notEqual(e.state, 'patrol');
});
test('hold and regroup commands work; teammates navigate into the holding room', () => {
  const sim = safeSim(); sim.order('hold'); const at = sim.friends.map(f => ({ x: f.x, z: f.z }));
  Object.assign(sim.player, { x: 10, z: -7 }); advance(sim, 2);
  sim.friends.forEach((f, i) => assert.ok(dist(f, at[i]) < .1));
  sim.order('regroup'); advance(sim, 35);
  sim.friends.forEach(f => { assert.ok(dist(f, sim.player) < 6, `${f.name} rejoined: ${dist(f, sim.player)}`); assert.equal(blocked(f.x, f.z, .3), false); });
});
test('complete rescue and physical escort to extraction with ordinary movement', () => {
  const sim = safeSim();
  function walkTo(goal) {
    const path = findPath(sim.player, goal); assert.ok(path.length);
    for (const target of path) {
      for (let i = 0; i < 200 && dist(sim.player, target) > .19; i++) {
        sim.player.yaw = Math.atan2(sim.player.x - target.x, sim.player.z - target.z);
        sim.tick(.05, { forward: 1 });
      }
      assert.ok(dist(sim.player, target) <= .2);
    }
  }
  walkTo({ x: 10, z: -7.5 }); assert.equal(sim.stage, 'locate');
  advance(sim, 1.8, { interact: true }); assert.equal(sim.hostage.freed, true); assert.equal(sim.stage, 'extract');
  walkTo(EXTRACT); advance(sim, 15);
  assert.equal(sim.status, 'won'); assert.ok(dist(sim.hostage, EXTRACT) < 6);
  assert.ok(sim.friends.every(f => dist(f, EXTRACT) < 8));
});
test('injury, dressing, revival, failure, pause and restart states', () => {
  const sim = safeSim(); sim.player.hp = 25; sim.heal(); advance(sim, 3.1); assert.equal(sim.player.hp, 90); assert.equal(sim.player.medkits, 0);
  const friend = sim.friends[0]; Object.assign(friend, { hp: 0, x: sim.player.x + 1, z: sim.player.z }); advance(sim, 2.6, { interact: true }); assert.equal(friend.hp, 60);
  sim.damage(sim.player, 100); assert.equal(sim.status, 'failed'); const t = sim.time; advance(sim, 1); assert.equal(sim.time, t);
  sim.reset(); assert.equal(sim.status, 'ready'); assert.equal(sim.player.hp, 100); assert.equal(sim.hostage.freed, false); assert.equal(sim.player.ammo, 30);
});

function isolatedContact() {
  const sim = new Simulation(() => .99); sim.start();
  sim.friends.forEach(f => f.hp = 0); sim.enemies.slice(1).forEach(e => e.hp = 0);
  Object.assign(sim.player, { x: 0, z: 20 });
  Object.assign(sim.enemies[0], { x: 0, z: 10, yaw: Math.PI });
  return { sim, enemy: sim.enemies[0] };
}

test('cover planner finds real protection, a clear firing position, and respects reservations', () => {
  const actor = { x: 0, z: 10 }, threat = { x: 0, z: 20 };
  const cover = chooseCover(actor, threat); assert.ok(cover);
  assert.equal(blocked(cover.hide.x, cover.hide.z, .43), false);
  assert.equal(protects(cover.hide, threat), true);
  assert.equal(visible(cover.peek, threat, 1.4, 1.2), true);
  assert.ok(findPath(actor, cover.hide).length);
  const other = chooseCover(actor, threat, [cover.hide]);
  assert.ok(!other || dist(other.hide, cover.hide) >= 1.6);
  assert.equal(chooseCover({ x: 30, z: -30 }, { x: 30, z: -25 }), null, 'no imaginary cover in empty terrain');
});

test('enemy physically reaches protection, crouches, peeks, fires bursts and reloads', () => {
  const { sim, enemy } = isolatedContact(), phases = new Set(), shots = [];
  let reloads = 0, hiddenFrames = 0;
  for (let i = 0; i < 1300; i++) {
    sim.tick(.05); phases.add(enemy.tactic);
    assert.equal(blocked(enemy.x, enemy.z, .3), false, 'cover movement respects colliders');
    if (enemy.tactic === 'hide') {
      hiddenFrames++; assert.equal(enemy.crouch, true);
      assert.equal(protects(enemy, sim.player), true, 'actual stopped position is behind cover, not just its goal');
    }
    for (const event of sim.events.splice(0)) {
      if (event.type === 'ai-reload') reloads++;
      if (event.type === 'shot' && event.faction === 'enemy') {
        shots.push(sim.time); assert.equal(enemy.tactic, 'peek'); assert.equal(enemy.crouch, false); assert.equal(enemy.moving, false);
        assert.equal(visible(enemy, sim.player, 1.4, 1.2), true);
      }
    }
  }
  assert.ok(hiddenFrames > 100);
  for (const phase of ['move', 'hide', 'peek', 'return']) assert.ok(phases.has(phase), phase);
  assert.ok(shots.length > 30, 'fires again after emptying and reloading magazine'); assert.ok(reloads >= 1);
  const intervals = shots.slice(1).map((time, i) => time - shots[i]);
  assert.ok(intervals.some(gap => gap < .21), 'close-spaced rounds within bursts');
  assert.ok(intervals.some(gap => gap > 1.3), 'deliberate pauses between exposures');
});

test('breaking sight during a burst cancels fire and preserves last observed position', () => {
  const { sim, enemy } = isolatedContact();
  for (let i = 0; i < 300 && enemy.ammo === 30; i++) sim.tick(.05);
  assert.ok(enemy.ammo < 30); const remembered = { ...enemy.lastSeen }, ammo = enemy.ammo;
  Object.assign(sim.player, { x: Math.sign(enemy.cover.hide.x) * 10, z: 20 }); sim.noises = [];
  assert.equal(visible(enemy, sim.player, 1.4, 1.2), false, 'fixture breaks the current firing angle');
  advance(sim, .5);
  assert.equal(enemy.ammo, ammo, 'remaining burst cannot shoot through the wall');
  assert.deepEqual(enemy.lastSeen, remembered);
  Object.assign(sim.player, { x: 30, z: -28 }); advance(sim, 10);
  assert.notEqual(enemy.state, 'combat', 'stale contact eventually becomes a search');
  assert.ok(!enemy.lastSeen || dist(enemy.lastSeen, remembered) < .01);
});

test('incoming damage makes a peeking enemy withdraw instead of finishing its burst', () => {
  const { sim, enemy } = isolatedContact();
  for (let i = 0; i < 300 && enemy.ammo === 30; i++) sim.tick(.05);
  assert.equal(enemy.tactic, 'peek'); const ammo = enemy.ammo;
  sim.damage(enemy, 1, sim.player); sim.tick(.05);
  assert.equal(enemy.tactic, 'return'); assert.equal(enemy.ammo, ammo);
  advance(sim, 1); assert.equal(enemy.tactic, 'hide'); assert.equal(enemy.crouch, true);
});

test('a visibly exposed cover position is abandoned when the threat changes angle', () => {
  const { sim, enemy } = isolatedContact();
  for (let i = 0; i < 300 && enemy.ammo === 30; i++) sim.tick(.05);
  const old = { ...enemy.cover.hide };
  Object.assign(sim.player, { x: Math.sign(old.x) * 10, z: 10 });
  assert.equal(visible(enemy, sim.player, 1.6, 1.3), true);
  assert.equal(protects(old, sim.player), false);
  sim.tick(.05);
  assert.ok(!enemy.cover || dist(enemy.cover.hide, old) > .1);
  if (enemy.cover) assert.equal(protects(enemy.cover.hide, sim.player), true);
});

test('an enemy in cover can investigate a new audible contact without firing blindly', () => {
  const { sim, enemy } = isolatedContact();
  for (let i = 0; i < 200 && enemy.tactic !== 'hide'; i++) sim.tick(.05);
  assert.equal(enemy.tactic, 'hide');
  const sound = { x: -8, z: 14 }, ammo = enemy.ammo;
  sim.noise(sound, 13); sim.tick(.05);
  assert.deepEqual(enemy.lastSeen, sound);
  assert.equal(enemy.ammo, ammo);
});

test('crouched enemy hit detection follows the lowered body and cover blocks rounds', () => {
  const sim = safeSim(), enemy = sim.enemies[0];
  Object.assign(sim.player, { x: 0, z: 20 }); Object.assign(enemy, { x: 0, z: 10, crouch: true, hp: 68 });
  sim.shoot({ x: 0, y: 0, z: -1 }); assert.equal(enemy.hp, 68, 'standing head height misses crouched model');
  sim.player.cooldown = 0;
  const dy = 1.02 - 1.68, length = Math.hypot(dy, 10);
  sim.shoot({ x: 0, y: dy / length, z: -10 / length }); assert.equal(enemy.hp, 0, 'lowered head is hittable');
  Object.assign(sim.player, { x: 4, z: 12, cooldown: 0 }); Object.assign(enemy, { x: 4, z: 5.65, hp: 68 });
  const bodyY = .52 - 1.68, bodyDistance = Math.hypot(bodyY, 6.35);
  sim.shoot({ x: 0, y: bodyY / bodyDistance, z: -6.35 / bodyDistance }); assert.equal(enemy.hp, 68, 'sandbags stop shots aimed at hidden torso');
});

test('aim takes time to raise and sprint recovery blocks firing without consuming ammunition', () => {
  const sim = safeSim(), p = sim.player;
  sim.tick(.05, { aim: true }); assert.ok(p.weapon.aim > 0 && p.weapon.aim < .25);
  advance(sim, .35, { aim: true }); assert.equal(p.weapon.aim, 1);
  advance(sim, .5, { sprint: true, forward: 1 });
  assert.equal(p.weapon.aim, 0); assert.equal(sim.shoot(), false);
  advance(sim, .15, { aim: true }); assert.equal(sim.shoot(), false); assert.equal(p.ammo, 30);
  advance(sim, .2, { aim: true }); assert.equal(sim.shoot(), true);
  assert.ok(p.weapon.aim < 1, 'rifle is available before the sight picture fully settles');
});

test('moving degrades precision, stopping settles it and crouching provides support', () => {
  const sim = safeSim(), p = sim.player;
  advance(sim, 1, { aim: true }); const steady = p.weapon.spread;
  advance(sim, .6, { aim: true, side: 1 }); assert.ok(p.weapon.spread > steady * 4);
  sim.tick(.05, { aim: true }); assert.ok(p.weapon.spread > steady * 3, 'movement does not settle instantly');
  advance(sim, 1.5, { aim: true }); assert.ok(p.weapon.spread < steady * 1.02);
  advance(sim, .5, { aim: true, crouch: true }); assert.ok(p.weapon.spread < steady * .7);
});

test('exertion creates lingering sway and recovers with rest', () => {
  const sim = safeSim(), p = sim.player;
  // Run laterally along the beach so exertion is not a collision artifact.
  advance(sim, 2, { sprint: true, side: 1 }); advance(sim, 2, { sprint: true, side: -1 });
  advance(sim, .7, { aim: true }); const tired = p.weapon.fatigue, tiredSpread = p.weapon.spread;
  assert.ok(tired > .4); assert.ok(p.stamina < 40);
  advance(sim, 9, { aim: true }); assert.ok(p.weapon.fatigue < .02); assert.ok(p.weapon.spread < tiredSpread * .7);
});

test('sustained bursts build recoil; deliberate shots settle; invalid fire never adds kick', () => {
  const burst = safeSim(), deliberate = safeSim();
  for (const sim of [burst, deliberate]) advance(sim, .5, { aim: true });
  for (let i = 0; i < 8; i++) {
    assert.equal(burst.shoot(), true); advance(burst, .15, { aim: true });
    assert.equal(deliberate.shoot(), true); advance(deliberate, .65, { aim: true });
  }
  assert.ok(burst.player.weapon.recoilPitch > deliberate.player.weapon.recoilPitch * 3);
  assert.ok(burst.player.weapon.strain > deliberate.player.weapon.strain);
  const p = burst.player; burst.reload(); const recoil = p.weapon.recoilPitch;
  assert.equal(burst.shoot(), false); assert.equal(p.weapon.recoilPitch, recoil);
  advance(burst, 2.5, { aim: true }); assert.ok(p.weapon.recoilPitch < .00001);
  assert.equal(p.pitch, 0, 'recoil recovery never changes the player input baseline');
  burst.reset(); assert.equal(burst.player.weapon.strain, 0); assert.equal(burst.player.weapon.aim, 0);
});

test('render orientation and hitscan share the same sight line and crouch-transition origin', () => {
  const sim = safeSim(), p = sim.player;
  Object.assign(p, { yaw: .8, pitch: -.12 });
  advance(sim, .5, { aim: true }); sim.shoot();
  sim.tick(.05, { aim: true, crouch: true });
  const orientation = weaponOrientation(p), camera = new PerspectiveCamera();
  camera.rotation.order = 'YXZ'; camera.rotation.set(orientation.pitch, orientation.yaw, 0);
  const rendered = camera.getWorldDirection(new Vector3()), ray = shotDirection(p, () => 0);
  assert.ok(Math.hypot(rendered.x - ray.x, rendered.y - ray.y, rendered.z - ray.z) < 1e-12);
  assert.ok(p.weapon.eye > 1.02 && p.weapon.eye < 1.68, 'height transitions smoothly');
  p.cooldown = 0; sim.events = []; sim.shoot(ray);
  assert.equal(sim.events.find(e => e.type === 'shot').from.y, p.weapon.eye);
});
