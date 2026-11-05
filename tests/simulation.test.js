import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation } from '../src/simulation.js';
import { SOLIDS, EXTRACT, HOSTAGE, blocked, moveBody, visible, findPath, dist } from '../src/world.js';

const advance = (sim, seconds, input = {}) => { for (let t = 0; t < seconds; t += .05) sim.tick(.05, input); };
const safeSim = () => { const sim = new Simulation(() => .5); sim.start(); sim.enemies.forEach(e => e.hp = 0); return sim; };

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
  assert.equal(e.state, 'search'); assert.deepEqual(e.lastSeen, lastSeen);
  assert.notDeepEqual(e.lastSeen, { x: sim.player.x, z: sim.player.z });
  e.state = 'patrol'; e.memory = 0; sim.noise({ x: 2, z: 16 }, 13); sim.tick(.05);
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
