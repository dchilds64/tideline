import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PerspectiveCamera, Vector3, Raycaster } from 'three';
import { Simulation } from '../src/simulation.js';
import { weaponOrientation, shotDirection, RELOAD_SECONDS } from '../src/weapon.js';
import { createViewmodel, ViewmodelLibrary } from '../src/viewmodel.js';

async function model(name) {
  globalThis.ProgressEvent ??= class extends Event { constructor(type, fields = {}) { super(type); Object.assign(this, fields); } };
  const bytes = await readFile(new URL(`../public/models/${name}.glb`, import.meta.url)), size = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + size));
  json.buffers[0].uri = `data:application/octet-stream;base64,${bytes.subarray(28 + size).toString('base64')}`;
  // Test the production geometry, skin and socket transforms without DOM image decoding.
  json.materials = json.materials.map(m => ({ name: m.name })); delete json.images; delete json.textures;
  return new GLTFLoader().parseAsync(JSON.stringify(json), '');
}
const templates = Promise.all([model('first-person'), model('reflex-sight')]).then(([rifle, optic]) => ({ rifle, optic }));
function scene() { const sim = new Simulation(() => .5); sim.start(); sim.enemies = []; sim.friends = []; return sim; }
const position = object => object.getWorldPosition(new Vector3());

test('physical red dot remains on the shared sight/hitscan line through recoil and crouch', async () => {
  const vm = createViewmodel(await templates), sim = scene(), p = sim.player, camera = new PerspectiveCamera(53, 16 / 9, .05, 240);
  camera.rotation.order = 'YXZ'; camera.add(vm.root); Object.assign(p, { yaw: .7, pitch: -.18 });
  for (let i = 0; i < 100; i++) {
    sim.tick(1 / 60, { aim: true, crouch: i > 45 }); if (i % 10 === 0) sim.shoot();
    const orientation = weaponOrientation(p); camera.position.set(p.x, p.weapon.eye, p.z); camera.rotation.set(orientation.pitch, orientation.yaw, 0);
    vm.update(p, .8, false); camera.updateMatrixWorld(true);
    if (p.weapon.aim === 1) {
      const dotRay = position(vm.dot).sub(position(camera)).normalize(), ray = new Vector3(...Object.values(shotDirection(p, () => 0)));
      assert.ok(dotRay.distanceTo(ray) < 1e-6, 'no additional viewmodel kick moves the optic off the actual shot line');
      const projected = position(vm.dot).project(camera); assert.ok(Math.hypot(projected.x, projected.y) < 1e-6);
      assert.equal(vm.dot.visible, true);
      const sightHits = new Raycaster(position(camera), dotRay).intersectObject(vm.sight, true);
      assert.ok(sightHits.every(h => h.object === vm.dot || h.object.material.transparent), 'optic aperture must show the actual scene, not an opaque lens');
    }
    assert.ok(position(vm.flash).distanceTo(position(vm.muzzle)) < .25);
  }
  vm.dispose();
});

test('reload moves the magazine and wrist continuously, refills at completion and resets cleanly', async () => {
  const vm = createViewmodel(await templates), sim = scene(), p = sim.player;
  p.ammo = 0; vm.update(p); const seated = vm.magazine.position.clone(); sim.reload();
  let moved = false, hidden = false, previousHand, maxStep = 0;
  for (let i = 0; i < 150; i++) {
    sim.tick(1 / 60); vm.update(p);
    const hand = position(vm.hand), wrist = position(vm.wristEnd);
    assert.ok(hand.distanceTo(wrist) < .002, 'support glove stays attached to the sleeve');
    if (previousHand) maxStep = Math.max(maxStep, hand.distanceTo(previousHand)); previousHand = hand;
    if (vm.magazine.position.distanceTo(seated) > .1) moved = true;
    if (!vm.magazine.visible) hidden = true;
    if (sim.time < RELOAD_SECONDS - 1e-6) { assert.equal(p.ammo, 0); assert.equal(sim.shoot(), false); }
  }
  assert.ok(moved && hidden); assert.ok(maxStep < .055, `no hand teleport: ${maxStep}`);
  assert.equal(p.ammo, 30); assert.equal(p.reserve, 60); assert.equal(vm.magazine.visible, true);
  assert.ok(vm.magazine.position.distanceTo(seated) < 1e-9);
  p.ammo = 7; sim.reload(); for (let i = 0; i < 60; i++) sim.tick(1 / 60); vm.update(p);
  const paused = vm.model.getObjectByName('FPArms').skeleton.bones.map(b => b.matrixWorld.toArray());
  for (let i = 0; i < 10; i++) vm.update(p);
  assert.deepEqual(vm.model.getObjectByName('FPArms').skeleton.bones.map(b => b.matrixWorld.toArray()), paused);
  sim.reset(); vm.update(sim.player); assert.ok(vm.magazine.position.distanceTo(seated) < 1e-9); assert.equal(vm.magazine.visible, true);
  vm.dispose();
});

test('viewmodel instances own their skeletons/materials and retain shared geometry on disposal', async () => {
  const source = await templates, first = createViewmodel(source), second = createViewmodel(source), sim = scene();
  const original = source.rifle.scene.getObjectByName('FPArms'), one = first.model.getObjectByName('FPArms'), two = second.model.getObjectByName('FPArms');
  assert.notEqual(one.skeleton, two.skeleton); assert.notEqual(one.material, two.material); assert.equal(one.geometry, original.geometry);
  let released = false; original.geometry.addEventListener('dispose', () => { released = true; });
  first.dispose(); second.update(sim.player); assert.equal(released, false); assert.ok(Number.isFinite(position(second.hand).x)); second.dispose();
});

test('missing or malformed first-person assets retain a playable procedural fallback', async () => {
  const warn = console.warn; console.warn = () => {};
  try {
    for (const loader of [{ loadAsync: async () => { throw new Error('offline file missing'); } }, { loadAsync: async () => ({ scene: new PerspectiveCamera() }) }]) {
      const library = new ViewmodelLibrary(loader); assert.deepEqual(await library.ready, ['first-person model']); assert.equal(library.create(), null);
    }
  } finally { console.warn = warn; }
});
