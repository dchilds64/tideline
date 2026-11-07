import * as THREE from 'three';
import { createActorMotion, updateActorMotion, solveLimb } from './animation.js';

// Small procedural skeleton. The simulation owns position and collision; this
// module owns only the visible pose, with hands constrained to weapon grips.
export function createActorRig(view, actor) {
  const root = new THREE.Group(), upper = new THREE.Group(); root.add(upper);
  const friendly = actor.type === 'friend', hostage = actor.type === 'hostage';
  const cloth = view.surfaces.fabric(hostage ? 0xb9b6a2 : friendly ? 0x66756a : 0x666052);
  const vest = view.surfaces.fabric(friendly ? 0x394d49 : 0x3b4241), skin = view.mat(0xa9967f);
  const black = view.mat(0x222d2c), helmet = view.surfaces.fabric(friendly ? 0x6a7865 : 0x464b46);
  view.rounded(.43, .58, .29, 0, 1.17, 0, cloth, upper, .1);
  if (!hostage) {
    view.rounded(.47, .43, .34, 0, 1.22, 0, vest, upper, .05);
    for (const x of [-.155, 0, .155]) {
      view.rounded(.125, .18, .1, x, 1.14, -.21, helmet, upper);
      view.box(.1, .025, .015, x, 1.17, -.27, vest, upper);
    }
    view.rounded(.34, .4, .19, 0, 1.23, .23, vest, upper, .06);
    for (const x of [-.17, .17]) view.rounded(.08, .22, .32, x, 1.43, 0, vest, upper);
    view.rounded(.44, .07, .32, 0, .9, 0, black, upper);
  }
  const head = view.mesh(new THREE.SphereGeometry(.18, 20, 16), skin, 0, 1.67, 0, upper); head.scale.set(.85, 1.15, .95);
  view.limb(.065, .16, 0, 1.48, 0, skin, upper);
  view.rounded(.055, .07, .065, 0, 1.66, -.16, skin, upper, .025);
  if (!hostage) {
    view.mesh(new THREE.SphereGeometry(.205, 24, 16, 0, Math.PI * 2, 0, Math.PI * .58), helmet, 0, 1.72, 0, upper);
    view.box(.29, .08, .11, 0, 1.7, -.17, black, upper);
    // Ear protection and helmet straps help the head read as equipment, rather than a sphere.
    for (const x of [-.17, .17]) {
      view.rounded(.07, .14, .105, x, 1.65, .01, black, upper);
      view.limbBetween(.013, [x, 1.7, -.03], [x * .65, 1.49, -.08], black, upper);
    }
    if (friendly) {
      for (const x of [-.1, .1]) view.cylinder(.04, .04, .1, x, 1.79, -.24, black, upper).rotation.x = Math.PI / 2;
      view.box(.14, .045, .018, .25, 1.34, -.04, view.mat(0xa6d9cc, .6, { emissive: 0x49877c, emissiveIntensity: .5 }), upper);
    }
  }
  const pelvis = view.rounded(.38, .21, .28, 0, .88, 0, cloth, root, .07);
  const legs = [-1, 1].map(side => ({
    side, thigh: view.limb(.102, .43, 0, 0, 0, cloth, root), shin: view.limb(.082, .43, 0, 0, 0, cloth, root),
    knee: view.mesh(new THREE.SphereGeometry(.084, 12, 10), cloth, 0, 0, 0, root),
    boot: view.rounded(.19, .16, .32, 0, 0, 0, black, root, .04),
    pad: hostage ? null : view.rounded(.15, .14, .055, 0, 0, 0, helmet, root, .025),
  }));
  const arms = [-1, 1].map(side => ({
    side, arm: view.limb(.074, .29, 0, 0, 0, cloth, upper), forearm: view.limb(.063, .30, 0, 0, 0, cloth, upper),
    elbow: view.mesh(new THREE.SphereGeometry(.063, 12, 10), cloth, 0, 0, 0, upper),
    hand: view.rounded(.095, .12, .12, 0, 0, 0, hostage ? skin : black, upper, .035),
  }));
  const rifle = new THREE.Group(); upper.add(rifle);
  let magazine, flash, spare;
  if (!hostage) {
    const metal = view.mat(0x293333, .45, { metalness: .65 });
    view.rounded(.075, .105, .24, 0, .015, -.075, metal, rifle, .01);
    view.rounded(.06, .13, .19, 0, .015, .12, black, rifle, .02);
    view.rounded(.075, .085, .25, 0, .025, -.3, metal, rifle, .012);
    view.rounded(.055, .13, .07, 0, -.095, -.01, black, rifle, .01).rotation.x = -.2;
    magazine = view.rounded(.055, .16, .095, 0, -.11, -.15, metal, rifle, .01); magazine.rotation.x = -.12;
    view.cylinder(.018, .018, .2, 0, .04, -.51, metal, rifle).rotation.x = Math.PI / 2;
    view.cylinder(.029, .029, .16, 0, .04, -.66, black, rifle).rotation.x = Math.PI / 2;
    view.rounded(.065, .06, .095, 0, .105, -.065, black, rifle, .01);
    for (const x of [-.042, .042]) for (let i = 0; i < 4; i++) view.box(.006, .025, .025, x, .035, -.21 - i * .05, black, rifle);
    flash = view.mesh(new THREE.ConeGeometry(.065, .17, 5), new THREE.MeshBasicMaterial({ color: 0xffd694 }), 0, .04, -.8, rifle); flash.rotation.x = -Math.PI / 2; flash.visible = false;
    spare = view.rounded(.055, .16, .095, 0, 0, 0, metal, upper, .01); spare.visible = false;
  }
  root.userData = { upper, pelvis, rifle, legs, arms, magazine, flash, spare, hostage, motion: createActorMotion(actor) };
  animateActorRig(root, actor, 0, 0);
  return root;
}

const axis = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3(), point = new THREE.Vector3();
function segment(mesh, from, to) {
  mesh.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
  direction.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
  mesh.quaternion.setFromUnitVectors(axis, direction);
}
function grip(rifle, x, y, z) { return point.set(x, y, z).applyMatrix4(rifle.matrix).toArray(); }

export function animateActorRig(root, actor, dt, time) {
  const rig = root.userData, m = updateActorMotion(rig.motion, actor, dt, time);
  root.position.set(actor.x, m.fall * .2, actor.z); root.rotation.set(0, m.yaw, m.fall * Math.PI / 2);
  // Crouch keeps the head aligned with the simulation's lowered hit volume.
  rig.upper.position.y = -.63 * m.crouch + m.bob;
  rig.upper.rotation.y = m.chestYaw;
  rig.pelvis.position.y = m.hip + .025; rig.pelvis.rotation.y = m.chestYaw * .3;
  rig.legs.forEach((leg, i) => {
    const hip = [leg.side * .15, m.hip, 0], pose = solveLimb(hip, m.localFeet[i], .43, .43, [leg.side * .12, 0, -1]);
    segment(leg.thigh, hip, pose.joint); segment(leg.shin, pose.joint, pose.end);
    leg.knee.position.fromArray(pose.joint);
    leg.boot.position.set(pose.end[0], pose.end[1] - .03, pose.end[2] - .055);
    // A subtle toe lift while swinging, flat soles when planted.
    leg.boot.rotation.x = Math.sin(m.feet[i].progress * Math.PI) * -.18;
    if (leg.pad) { leg.pad.position.set(pose.joint[0], pose.joint[1], pose.joint[2] - .075); leg.pad.quaternion.copy(leg.shin.quaternion); }
  });
  const reloading = !rig.hostage && actor.reload > 0, reload = reloading ? Math.max(0, Math.min(1, 1 - actor.reload / 2.8)) : 0;
  const rifle = rig.rifle;
  rifle.position.set(.09, 1.35 + .08 * m.crouch, -.07 + m.recoil * .025);
  rifle.rotation.set(-.42 * (1 - m.ready) + m.recoil * .065 - (reloading ? .2 : 0), 0, reloading ? -.22 : 0);
  rifle.updateMatrix();
  if (rig.flash) rig.flash.visible = m.recoil > .5 && actor.hp > 0;
  if (rig.magazine) rig.magazine.visible = !reloading || reload < .18 || reload > .68;
  if (rig.spare) rig.spare.visible = reloading && reload > .35 && reload < .68;
  rig.arms.forEach(arm => {
    const shoulder = [arm.side * .255, 1.4, .015];
    let target;
    if (rig.hostage) {
      const walking = Math.min(1, m.speed), swing = Math.sin(m.distance * 5 + (arm.side > 0 ? Math.PI : 0)) * .17 * walking;
      target = actor.freed ? [arm.side * .3, .91, swing - .02] : [arm.side * .07, .96, -.23];
    } else {
      target = arm.side > 0 ? grip(rifle, 0, -.095, -.01) : grip(rifle, 0, -.025, -.34);
      if (arm.side < 0 && reloading) {
        // Support hand visits the magazine well and belt; the firing hand stays on the grip.
        const well = grip(rifle, 0, -.15, -.15), belt = [-.22, .92, -.21];
        const keys = [target, well, belt, belt, well, target], times = [0, .15, .32, .48, .72, 1];
        let k = 0; while (k < times.length - 2 && reload > times[k + 1]) k++;
        let t = (reload - times[k]) / (times[k + 1] - times[k]); t = t * t * (3 - 2 * t);
        target = keys[k].map((v, i) => v + (keys[k + 1][i] - v) * t);
      }
    }
    const pose = solveLimb(shoulder, target, .29, .30, [arm.side, -.45, .3]);
    segment(arm.arm, shoulder, pose.joint); segment(arm.forearm, pose.joint, pose.end);
    arm.elbow.position.fromArray(pose.joint);
    arm.hand.position.fromArray(pose.end); arm.hand.rotation.copy(rifle.rotation);
    if (arm.side < 0 && rig.spare) rig.spare.position.fromArray(pose.end);
  });
}
