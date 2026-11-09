import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { solveLimb } from './animation.js';
import { RELOAD_SECONDS } from './weapon.js';

const SCALE = .55;
const SIGHT_HEIGHT = .265;
const ease = (a, b, t) => THREE.MathUtils.smoothstep(t, a, b);
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class ViewmodelLibrary {
  constructor(loader = new GLTFLoader()) {
    this.template = null;
    this.ready = Promise.all([loader.loadAsync('/models/first-person.glb'), loader.loadAsync('/models/reflex-sight.glb'), loader.loadAsync('/models/hands.glb'), loader.loadAsync('/models/trigger-hand.glb')]).then(([rifle, optic, arms, trigger]) => {
      for (const name of ['Magazine', 'MagazineGripSocket', 'MuzzleSocket']) {
        if (!rifle.scene.getObjectByName(name)) throw new Error(`First-person model missing ${name}`);
      }
      for (const name of ['L_arm_01', 'L_elbow_02', 'L_wrist_03', 'LeftGripAnchorFrame']) if (!arms.scene.getObjectByName(name)) throw new Error(`Native hand rig missing ${name}`);
      if (!arms.scene.getObjectByName('LongGunReloadForearmsMesh')?.isSkinnedMesh || !optic.scene.getObjectByName('MicroOptic') || !trigger.scene.getObjectByName('RightArm')) throw new Error('Invalid first-person model');
      this.template = { rifle, optic, arms, trigger }; return [];
    }).catch(error => { console.warn('First-person assets unavailable; using procedural fallback.', error.message); return ['first-person model']; });
  }
  create() { return this.template ? createViewmodel(this.template) : null; }
}

// The camera owns the sight line. Everything here is presentation, sampled from
// simulation state so pausing and restarting cannot leave a half-finished reload.
export function createViewmodel({ rifle, optic, arms, trigger }) {
  const root = new THREE.Group(), model = clone(rifle.scene); root.name = 'FirstPerson'; root.add(model); model.scale.setScalar(SCALE);
  // Keep the native mesh/skin/finger hierarchy together. Fitting the whole arm
  // rig preserves hand anatomy; baking one rig's pose into another did not.
  const armRig = clone(arms.scene); model.add(armRig); armRig.rotation.y = Math.PI;
  armRig.scale.setScalar(.70 / SCALE); armRig.position.set(0, -.06 / SCALE, .25 / SCALE);
  const armMesh = armRig.getObjectByName('LongGunReloadForearmsMesh'); armMesh.name = 'FPArms';
  const triggerArm = trigger.scene.clone(true); model.add(triggerArm);
  triggerArm.scale.setScalar(.70 / SCALE); triggerArm.position.copy(armRig.position);
  const sight = optic.scene.clone(true); model.add(sight); sight.position.set(0, SIGHT_HEIGHT, .15);
  model.getObjectByName('RearIronSight').visible = false;
  const materials = new Set(), geometry = new Set(), skeletons = new Set();
  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = false; o.frustumCulled = false;
    o.material = o.material.clone(); materials.add(o.material);
    o.material.roughness = Math.max(.65, o.material.roughness); o.material.envMapIntensity = 1.8;
    if (o.material.name === 'arms' || o.material.name.startsWith('Hands')) {
      o.material.metalness = 0; o.material.roughnessMap = null; o.material.roughness = .95;
      o.material.color.setRGB(.78, .82, .74); o.material.normalScale.set(.7, .7);
    }
    for (const map of [o.material.map, o.material.normalMap, o.material.roughnessMap]) if (map) map.anisotropy = 4;
    if (o.isSkinnedMesh) skeletons.add(o.skeleton);
  });
  function mesh(geo, material, position, parent = model) {
    const object = new THREE.Mesh(geo, material); object.position.copy(position); object.frustumCulled = false;
    parent.add(object); geometry.add(geo); materials.add(material); return object;
  }
  const hardware = new THREE.MeshStandardMaterial({ color: 0x303534, metalness: .7, roughness: .48 });
  // A riser attaches the optic to the receiver rail; its aperture is the ADS datum.
  mesh(new THREE.BoxGeometry(.072, .035, .13), hardware, v(0, .181, .15));
  const dot = mesh(new THREE.SphereGeometry(.00115, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff4e30, toneMapped: false, fog: false }), v(0, 0, -.075), sight);
  const glass = mesh(new THREE.CircleGeometry(.029, 32), new THREE.MeshBasicMaterial({ color: 0x6fa7a0, transparent: true, opacity: .08, depthWrite: false, side: THREE.DoubleSide }), v(0, 0, .088), sight);
  const muzzle = model.getObjectByName('MuzzleSocket');
  // Original modeled suppressor with annular seams and a recessed muzzle.
  const suppressor = mesh(new THREE.CylinderGeometry(.047, .047, .30, 32), hardware, v(0, 0, -.13), muzzle); suppressor.rotation.x = Math.PI / 2;
  for (const z of [-.025, -.07, -.235]) { const ring = mesh(new THREE.TorusGeometry(.0475, .0018, 4, 32), hardware, v(0, 0, z), muzzle); ring.rotation.z = .2; }
  mesh(new THREE.CircleGeometry(.032, 24), new THREE.MeshBasicMaterial({ color: 0x080b0c, side: THREE.DoubleSide }), v(0, 0, -.281), muzzle);
  const flash = mesh(new THREE.ConeGeometry(.065, .22, 7), new THREE.MeshBasicMaterial({ color: 0xffdb9a, transparent: true, opacity: .88, depthWrite: false, toneMapped: false }), v(0, 0, -.39), muzzle);
  flash.rotation.x = -Math.PI / 2; flash.visible = false;
  const flashLight = new THREE.PointLight(0xffc888, 0, 4); flashLight.position.set(0, 0, -.3); muzzle.add(flashLight);

  const magazine = model.getObjectByName('Magazine'), socket = model.getObjectByName('MagazineGripSocket');
  const hand = armRig.getObjectByName('L_wrist_03'), upper = armRig.getObjectByName('L_arm_01'), lower = armRig.getObjectByName('L_elbow_02');
  const gripFrame = armRig.getObjectByName('LeftGripAnchorFrame');
  const rest = []; model.traverse(o => { if (o.isBone) rest.push({ object: o, p: o.position.clone(), q: o.quaternion.clone() }); });
  const magHome = magazine.position.clone(), magRotation = magazine.quaternion.clone();
  root.updateMatrixWorld(true);
  const local = object => model.worldToLocal(object.getWorldPosition(v()));
  const handHome = local(hand), handWorldRotation = hand.getWorldQuaternion(new THREE.Quaternion());
  const wristFromGrip = handHome.clone().sub(local(gripFrame));
  // Store rotation in model space, independent of the camera orientation.
  const handHomeRotation = model.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handWorldRotation);
  const upperLength = local(upper).distanceTo(local(lower)), lowerLength = local(lower).distanceTo(local(hand));
  const a = v(), b = v(), direction = v(), targetDirection = v(), delta = new THREE.Quaternion(), world = new THREE.Quaternion(), parent = new THREE.Quaternion();
  function point(bone, child, target) {
    bone.getWorldPosition(a); child.getWorldPosition(b);
    direction.copy(b).sub(a).normalize(); targetDirection.copy(target).sub(a).normalize();
    delta.setFromUnitVectors(direction, targetDirection);
    bone.getWorldQuaternion(world).premultiply(delta); bone.parent.getWorldQuaternion(parent).invert();
    bone.quaternion.copy(parent).multiply(world); bone.updateWorldMatrix(false, true);
  }
  function moveHand(goal, turn) {
    const elbowPole = v(-.35, -1, .3).applyQuaternion(root.quaternion.clone().invert()).toArray();
    const pose = solveLimb(local(upper).toArray(), goal.toArray(), upperLength, lowerLength, elbowPole);
    point(upper, lower, model.localToWorld(v(...pose.joint)));
    point(lower, hand, model.localToWorld(v(...pose.end)));
    const handTarget = model.getWorldQuaternion(new THREE.Quaternion()).multiply(new THREE.Quaternion().setFromAxisAngle(v(0, 0, 1), turn)).multiply(handHomeRotation);
    hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(handTarget));
    hand.updateWorldMatrix(false, true);
  }
  function update(player, kick = 0, flashOn = false) {
    const w = player.weapon, t = player.reload > 0 ? THREE.MathUtils.clamp(1 - player.reload / RELOAD_SECONDS, 0, 1) : 0;
    const busy = player.reload > 0, tilt = busy ? ease(0, .16, t) * (1 - ease(.83, 1, t)) : 0;
    const aim = w.aim, low = w.lowReady / .3;
    root.position.set(.20 * (1 - aim) - tilt * .035 + Math.sin(w.stepPhase * .5) * .008 * w.motion * (1 - aim), -.28 + aim * (.28 - SIGHT_HEIGHT * SCALE) - low * .12 + tilt * .065, -.74 + .19 * aim + kick * .025);
    // Recoil already rotates the camera and hitscan together. Keep the optic
    // centered in ADS; a second rotational kick would falsify the sight picture.
    root.rotation.set(-low * .32 + tilt * .08 + kick * .018 * (1 - aim), tilt * .10, -tilt * .48);
    for (const r of rest) { r.object.position.copy(r.p); r.object.quaternion.copy(r.q); }
    magazine.position.copy(magHome); magazine.quaternion.copy(magRotation); magazine.visible = true;
    root.updateMatrixWorld(true);
    // This first-person rig ends above the elbow. Keep the body attachment
    // below the viewport and bend down, so the sleeve opening never faces the
    // viewer as the support hand moves back to the magazine.
    const shoulderAnchor = v(-.18, -.50, -.30);
    if (root.parent) root.parent.localToWorld(shoulderAnchor);
    upper.position.copy(upper.parent.worldToLocal(shoulderAnchor));
    root.updateMatrixWorld(true); moveHand(handHome, 0);
    if (busy) {
      const withdraw = ease(.18, .36, t), insert = ease(.58, .76, t);
      const pouch = ease(.34, .43, t) * (1 - ease(.50, .58, t));
      const travel = withdraw * (1 - insert);
      magazine.position.add(v(-.08 * travel - .20 * pouch, -.38 * travel - .20 * pouch, .035 * travel));
      magazine.rotation.z = -.12 * travel;
      magazine.visible = !(t > .43 && t < .50);
      root.updateMatrixWorld(true);
      const grip = local(socket).add(wristFromGrip);
      const reach = ease(0, .18, t) * (1 - ease(.79, .98, t));
      const goal = handHome.clone().lerp(grip, reach);
      // Empty reload includes a short bolt-release press before regripping.
      if (player.ammo === 0 && t > .76 && t < .91) goal.lerp(v(-.09, .10, .10), Math.sin((t - .76) / .15 * Math.PI) ** 2);
      moveHand(goal, 0);
    }
    dot.visible = aim > .7 && !busy && !low; glass.visible = !busy;
    flash.visible = flashOn; flash.rotation.z = w.phase * 63;
    flashLight.intensity = flashOn ? 7 : 0;
    root.updateMatrixWorld(true);
  }
  return { root, model, armRig, armMesh, triggerArm, upper, lower, sight, dot, muzzle, magazine, hand, gripFrame, flash, flashLight, update,
    dispose() { materials.forEach(m => m.dispose()); geometry.forEach(g => g.dispose()); skeletons.forEach(s => s.dispose()); } };
}
