import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { createActorMotion, updateActorMotion, solveLimb } from './animation.js';
import { createActorWeapon } from './actor-view.js';

const canonical = name => name.replace('mixamorig', '').replace(/_\d+$/, '');
export function operatorClip(actor, speed, time) {
  if (actor.hp <= 0) return 'death';
  const stance = actor.aimUntil > time && !actor.reload ? 'aim' : 'ready';
  if (actor.crouch) return `${stance}_crouch_${speed > .18 ? 'walk' : 'idle'}`;
  if (speed > 2.45) return 'ready_run';
  return `${stance}_${speed > .18 ? 'walk' : 'idle'}`;
}

export class OperatorLibrary {
  constructor(loader = new GLTFLoader()) {
    this.template = null;
    this.ready = loader.loadAsync('/models/operator.glb').then(gltf => {
      const required = ['ready_idle', 'aim_idle', 'ready_walk', 'aim_walk', 'ready_run', 'ready_crouch_idle', 'ready_crouch_walk', 'aim_crouch_idle', 'aim_crouch_walk', 'death'];
      if (required.some(name => !gltf.animations.some(c => c.name === name))) throw new Error('Operator animation missing');
      const names = new Set(); let skinned = false;
      gltf.scene.traverse(o => { if (o.isBone) names.add(canonical(o.name)); if (o.isSkinnedMesh) skinned = true; });
      if (!skinned || ['Spine2', 'Head', ...['Left', 'Right'].flatMap(side => ['Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot'].map(part => side + part))].some(name => !names.has(name))) throw new Error('Operator skeleton incomplete');
      this.template = gltf; return [];
    }).catch(error => { console.warn('Operator asset unavailable; using procedural fallback.', error.message); return ['operator model']; });
  }
  create(view, actor) {
    if (!this.template || actor.type === 'hostage') return null;
    return createOperator(view, actor, this.template);
  }
}

export function createOperator(view, actor, template) {
  const root = new THREE.Group(), model = clone(template.scene); root.add(model); model.rotation.y = Math.PI;
  const bones = new Map(), materials = new Set(), skeletons = new Set();
  model.traverse(o => {
    if (o.isBone) bones.set(canonical(o.name), o);
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      // Each instance owns its material, while geometry and texture maps are shared.
      o.material = o.material.clone(); materials.add(o.material);
      if (actor.type === 'enemy') o.material.color.multiply(new THREE.Color(.80, .77, .68));
      o.material.roughness = Math.max(.55, o.material.roughness);
      if (o.isSkinnedMesh) { skeletons.add(o.skeleton); o.frustumCulled = false; }
    }
  });
  const mixer = new THREE.AnimationMixer(model), actions = new Map(template.animations.map(c => [c.name, mixer.clipAction(c)]));
  const weapon = createActorWeapon(view, root), motion = createActorMotion(actor);
  let active, activeName, dead = actor.hp <= 0, footLock = 1;
  const v = () => new THREE.Vector3(), q = () => new THREE.Quaternion();
  const shoulder = v(), elbow = v(), wrist = v(), target = v(), currentDirection = v(), desiredDirection = v();
  const parentQuaternion = q(), worldQuaternion = q(), delta = q(), handQuaternion = q();
  const limbs = ['Left', 'Right'].map((side, i) => ({ side: i ? 1 : -1, upper: bones.get(`${side}Arm`), lower: bones.get(`${side}ForeArm`), hand: bones.get(`${side}Hand`) }));
  const skeleton = [...skeletons][0];
  function bindRotation(bone) {
    const matrix = skeleton.boneInverses[skeleton.bones.indexOf(bone)].clone().invert();
    return new THREE.Quaternion().setFromRotationMatrix(matrix.clone().extractRotation(matrix));
  }
  const legs = ['Left', 'Right'].map((side, i) => ({ side: i ? 1 : -1, upper: bones.get(`${side}UpLeg`), lower: bones.get(`${side}Leg`), hand: bones.get(`${side}Foot`), pole: [0, 0, -1], foot: bindRotation(bones.get(`${side}Foot`)) }));
  const chest = bones.get('Spine2');
  // Faction recognition remains visible at night without tinting faces neon.
  let patch;
  if (actor.type === 'friend') {
    patch = view.rounded(.075, .035, .015, 0, 0, 0, view.mat(0x8ebdb3, .8, { emissive: 0x294c46, emissiveIntensity: .25 }), root, .004);
  }
  function localPosition(bone, output) { return root.worldToLocal(bone.getWorldPosition(output)); }
  function pointBone(bone, child, worldTarget) {
    bone.getWorldPosition(shoulder); child.getWorldPosition(elbow);
    currentDirection.copy(elbow).sub(shoulder).normalize(); desiredDirection.copy(worldTarget).sub(shoulder).normalize();
    delta.setFromUnitVectors(currentDirection, desiredDirection);
    bone.getWorldQuaternion(worldQuaternion).premultiply(delta);
    bone.parent.getWorldQuaternion(parentQuaternion).invert(); bone.quaternion.copy(parentQuaternion).multiply(worldQuaternion);
    bone.updateWorldMatrix(false, true);
  }
  function constrainLimb(limb, goal) {
    localPosition(limb.upper, shoulder); localPosition(limb.lower, elbow); localPosition(limb.hand, wrist);
    const start = shoulder.toArray(), l1 = shoulder.distanceTo(elbow), l2 = elbow.distanceTo(wrist);
    const pose = solveLimb(start, goal.toArray(), l1, l2, limb.pole || [limb.side, -.45, .3]);
    limb.hand.getWorldQuaternion(handQuaternion);
    if (limb.foot) {
      root.getWorldQuaternion(worldQuaternion).multiply(delta.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)).multiply(limb.foot);
      handQuaternion.slerp(worldQuaternion, footLock);
    }
    pointBone(limb.upper, limb.lower, root.localToWorld(target.fromArray(pose.joint)));
    pointBone(limb.lower, limb.hand, root.localToWorld(target.fromArray(pose.end)));
    limb.hand.parent.getWorldQuaternion(parentQuaternion).invert(); limb.hand.quaternion.copy(parentQuaternion).multiply(handQuaternion);
    limb.hand.updateWorldMatrix(false, true);
  }
  function update(actor, dt, time) {
    const m = updateActorMotion(motion, actor, dt, time), name = operatorClip(actor, m.speed, time);
    root.position.set(actor.x, 0, actor.z); root.rotation.y = m.yaw;
    if (name !== activeName) {
      const next = actions.get(name); next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1);
      next.setLoop(name === 'death' ? THREE.LoopOnce : THREE.LoopRepeat, Infinity); next.clampWhenFinished = name === 'death';
      if (active) { active.fadeOut(.18); next.fadeIn(.18); }
      next.play(); active = next; activeName = name;
      // Rejoining a moving squad must not put every operator on the same foot.
      if (name.includes('walk') || name.includes('run')) next.time = (actor.id.endsWith('1') ? .43 : .08) * next.getClip().duration;
    }
    if (activeName.includes('walk') || activeName.includes('run')) active.setEffectiveTimeScale(THREE.MathUtils.clamp(m.speed / (actor.crouch ? 1.05 : activeName.includes('run') ? 3 : 1.55), .45, 1.8));
    if (dead && actor.hp > 0) { actions.get('death').stop(); dead = false; }
    if (actor.hp <= 0) dead = true;
    mixer.update(dt); root.updateMatrixWorld(true);
    if (!dead) {
      footLock += ((m.speed < .18 ? 1 : 0) - footLock) * (1 - Math.exp(-dt * 14));
      if (footLock > .001) for (const leg of legs) {
        const goal = localPosition(leg.hand, v()).lerp(new THREE.Vector3(leg.side * .20, .13, leg.side * .10), footLock);
        constrainLimb(leg, goal);
      }
      // The animation supplies shoulders, torso and fingers. Two-bone IK keeps
      // the grips aligned to a rifle facing the simulation's observed heading.
      const chestPosition = localPosition(chest, v());
      const reload = actor.reload ? THREE.MathUtils.clamp(1 - actor.reload / 2.8, 0, 1) : 0;
      weapon.rifle.position.set(.10, chestPosition.y + .10, chestPosition.z - .14 + m.recoil * .025);
      weapon.rifle.rotation.set(-.32 * (1 - m.ready) + m.recoil * .055 - (actor.reload ? .14 : 0), 0, actor.reload ? -.18 : 0);
      weapon.rifle.updateMatrix();
      for (const limb of limbs) {
        const goal = new THREE.Vector3(0, limb.side > 0 ? -.095 : -.025, limb.side > 0 ? -.01 : -.25).applyMatrix4(weapon.rifle.matrix);
        // Wrist is behind the palm. The closed-hand clip supplies finger poses.
        goal.z += .035;
        if (limb.side < 0 && actor.reload) {
          const belt = new THREE.Vector3(-.20, chestPosition.y - .28, chestPosition.z - .15);
          const amount = Math.sin(reload * Math.PI) ** 2; goal.lerp(belt, amount);
          weapon.spare.position.copy(goal);
        }
        constrainLimb(limb, goal);
      }
      // Keep the eyes toward the observed contact while the torso leans in a
      // crouch. Head position still comes from the authored skeleton animation.
      const head = bones.get('Head');
      root.getWorldQuaternion(worldQuaternion).multiply(delta.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      head.parent.getWorldQuaternion(parentQuaternion).invert(); parentQuaternion.multiply(worldQuaternion);
      head.quaternion.slerp(parentQuaternion, m.ready * .8); head.updateWorldMatrix(false, true);
      weapon.magazine.visible = !actor.reload || reload < .18 || reload > .72;
      weapon.spare.visible = !!actor.reload && reload > .4 && reload < .72;
    } else {
      // Keep the rifle with the fallen operator; no independent physics body.
      localPosition(bones.get('RightHand'), weapon.rifle.position); weapon.rifle.rotation.set(0, .4, Math.PI / 2); weapon.spare.visible = false;
    }
    weapon.flash.visible = m.recoil > .5 && !dead;
    if (patch) {
      localPosition(bones.get('RightArm'), patch.position); patch.position.x += .04; patch.position.z -= .075;
    }
    root.updateMatrixWorld(true);
  }
  root.userData = { motion, update, model, mixer, bones, weapon, get activeClip() { return activeName; }, dispose() {
    mixer.stopAllAction(); mixer.uncacheRoot(model);
    materials.forEach(m => m.dispose()); skeletons.forEach(s => s.dispose());
    weapon.rifle.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    weapon.spare.geometry.dispose(); weapon.spare.material.dispose();
    if (patch) { patch.geometry.dispose(); patch.material.dispose(); }
  } };
  update(actor, 0, 0); return root;
}
