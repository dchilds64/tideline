import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Matrix4, Vector3 } from 'three';
import { surfaceHit, wallDistance } from '../src/world.js';
import { ImpactEffects } from '../src/impacts.js';
import { Simulation } from '../src/simulation.js';

test('surface hits agree with collision distance and identify outward faces and material', () => {
  for (const [origin, direction, material, normal] of [
    [{ x: 7, y: 1.5, z: 17 }, { x: 0, y: 0, z: -1 }, 'concrete', { x: 0, y: 0, z: 1 }],
    [{ x: 7, y: 1.5, z: 13 }, { x: 0, y: 0, z: 1 }, 'concrete', { x: 0, y: 0, z: -1 }],
    [{ x: -7, y: 1, z: 10 }, { x: 0, y: 0, z: -1 }, 'wood', { x: 0, y: 0, z: 1 }],
    [{ x: 13, y: 1, z: -12.5 }, { x: 0, y: 0, z: -1 }, 'metal', { x: 0, y: 0, z: 1 }],
    [{ x: 0, y: 1.5, z: 25 }, { x: 0, y: -1, z: 0 }, 'sand', { x: 0, y: 1, z: 0 }],
  ]) {
    const hit = surfaceHit(origin, direction);
    assert.equal(hit.surface, material); assert.deepEqual(hit.normal, normal);
    assert.ok(Math.abs(hit.distance - wallDistance(origin, direction, 85)) < 1e-8);
  }
  assert.equal(surfaceHit({ x: 0, y: 2, z: 20 }, { x: 0, y: 1, z: 0 }), null, 'sky does not create impacts');
  assert.equal(surfaceHit({ x: 10, y: 1, z: -9 }, { x: 0, y: -1, z: 0 }).surface, 'concrete', 'interior floor uses concrete');
  assert.equal(surfaceHit({ x: -9, y: .5, z: 25 }, { x: 0, y: 0, z: -1 }).decal, false, 'irregular rock avoids floating box-face decals');
});

test('player and AI surface events stop at the first impact, with no wall mark on an actor hit', () => {
  const sim = new Simulation(() => .99); sim.start(); sim.enemies.forEach(e => e.hp = 0);
  Object.assign(sim.player, { x: 7, z: 17 }); sim.shoot({ x: 0, y: 0, z: -1 });
  assert.equal(sim.events.find(e => e.type === 'impact').solidId, 'south-east');
  sim.events = []; sim.player.cooldown = 0; sim.player.x = 0;
  Object.assign(sim.enemies[0], { x: 0, z: 12, hp: 68 }); sim.shoot({ x: 0, y: 0, z: -1 });
  assert.ok(sim.events.some(e => e.type === 'hit')); assert.ok(!sim.events.some(e => e.type === 'impact'));
  sim.events = []; Object.assign(sim.player, { x: 0, z: 20 });
  const actor = sim.enemies[1]; Object.assign(actor, { hp: 68, x: 0, z: 10, cooldown: 0, aimTime: 1 });
  sim.aiFire(actor, sim.player, .05, false);
  const shot = sim.events.find(e => e.type === 'shot'), impact = sim.events.find(e => e.type === 'impact');
  assert.ok(shot && impact); assert.deepEqual(shot.to, impact.point); assert.equal(sim.player.hp, 100);
});

test('marks face the struck surface, persist after debris, and reset with bounded resource use', () => {
  const scene = new Scene(), effects = new ImpactEffects(scene, () => .5);
  const hit = surfaceHit({ x: 7, y: 1.5, z: 17 }, { x: 0, y: 0, z: -1 });
  for (let i = 0; i < 200; i++) effects.emit(hit);
  const pool = effects.decals.get('concrete'), matrix = new Matrix4(); pool.mesh.getMatrixAt(0, matrix);
  assert.equal(pool.mesh.count, 32); assert.ok(effects.particles.length <= 128); assert.equal(effects.dust.length, 24);
  assert.ok(new Vector3(0, 0, 1).transformDirection(matrix).distanceTo(new Vector3(0, 0, 1)) < 1e-7);
  assert.ok(new Vector3().setFromMatrixPosition(matrix).z > hit.point.z, 'mark offset is outward');
  const before = effects.particles.map(p => p.position.toArray()); effects.update(0);
  assert.deepEqual(effects.particles.map(p => p.position.toArray()), before, 'pause freezes debris');
  effects.update(2); assert.equal(effects.particles.length, 0); assert.equal(pool.mesh.count, 32);
  assert.ok(effects.dust.every(p => !p.mesh.visible));
  effects.reset(); assert.equal(pool.mesh.count, 0); assert.equal(effects.chips.count, 0);
  effects.dispose(); assert.equal(scene.children.length, 0);
});

test('metal sparks and wood splinters are distinct and edge hits do not spill marks around corners', () => {
  const effects = new ImpactEffects(new Scene(), () => .5);
  effects.emit(surfaceHit({ x: 13, y: 1, z: -12.5 }, { x: 0, y: 0, z: -1 }));
  assert.equal(effects.sparks.count, 9); assert.equal(effects.chips.count, 0);
  effects.update(.4); assert.equal(effects.sparks.count, 0);
  effects.emit(surfaceHit({ x: -7, y: 1, z: 10 }, { x: 0, y: 0, z: -1 }));
  assert.ok(effects.particles.every(p => p.wood));
  const edge = surfaceHit({ x: 3.0001, y: 1, z: 17 }, { x: 0, y: 0, z: -1 });
  effects.emit(edge); assert.equal(effects.decals.get('concrete').mesh.count, 0);
  effects.dispose();
});
