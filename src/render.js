import * as THREE from 'three';
import { SOLIDS, EXTRACT, HOSTAGE } from './world.js';

export class GameView {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.35;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x111e2e); this.scene.fog = new THREE.FogExp2(0x182b3b, .014);
    this.camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, .05, 240); this.camera.rotation.order = 'YXZ'; this.scene.add(this.camera);
    this.actorMeshes = new Map(); this.effects = []; this.bob = 0; this.kick = 0;
    this.materials = {};
    this.buildWorld(); this.buildWeapon();
    window.addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); });
  }
  mat(color, roughness = .9, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness, ...extra }); }
  mesh(geometry, material, x, y, z, parent = this.scene) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  box(w, h, d, x, y, z, material, parent = this.scene) { return this.mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent); }
  cylinder(r, rt, h, x, y, z, material, parent = this.scene, segments = 10) { return this.mesh(new THREE.CylinderGeometry(r, rt, h, segments), material, x, y, z, parent); }
  texture(base, speckle, count = 9000) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d'); c.fillStyle = base; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < count; i++) { c.globalAlpha = Math.random() * .35; c.fillStyle = speckle; c.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3); }
    const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  sign(text, x, y, z, width = 2, color = '#d3c79d', rotation = 0) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#263735'; g.fillRect(0, 0, 512, 128); g.strokeStyle = color; g.lineWidth = 3; g.strokeRect(8, 8, 496, 112);
    g.font = 'bold 38px monospace'; g.textAlign = 'center'; g.fillStyle = color; g.fillText(text, 256, 79);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const m = this.mesh(new THREE.PlaneGeometry(width, width / 4), new THREE.MeshStandardMaterial({ map: tex, roughness: .8, emissive: color, emissiveIntensity: .04 }), x, y, z); m.rotation.y = rotation; return m;
  }
  buildWorld() {
    const moon = new THREE.DirectionalLight(0xa7c9f0, 2.5); moon.position.set(-25, 40, 12); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: .5, far: 120 }); moon.shadow.bias = -.0003; moon.shadow.normalBias = .035; this.scene.add(moon);
    this.scene.add(new THREE.HemisphereLight(0x89a6ca, 0x393d35, 1.4));
    const sand = this.texture('#7e7b64', '#3e463f'); sand.repeat.set(38, 38);
    this.box(180, .3, 140, 0, -.2, -30, this.mat(0xaaa78f, 1, { map: sand }));
    const concrete = this.texture('#8b8b7d', '#525d58'); concrete.repeat.set(2, 1);
    const wall = this.mat(0xa6ac99, .96, { map: concrete });
    const building = this.mat(0x9b9f8a, .93, { map: concrete });
    const olive = this.mat(0x535d48), darkMetal = this.mat(0x343f40, .65, { metalness: .45 }), timber = this.mat(0x7a7456);
    this.materials = { olive, darkMetal, timber };
    this.box(35, .025, 30, 0, -.02, -.1, this.mat(0x636a60, 1, { map: sand }));
    for (const b of SOLIDS) {
      let material = b.kind === 'building' ? building : b.kind === 'crate' ? timber : b.kind === 'rock' ? this.mat(0x626e68) : b.kind === 'sandbag' ? this.mat(0x8d9173) : b.kind === 'machine' ? olive : wall;
      const m = this.box(b.w, b.h, b.d, b.x, b.h / 2, b.z, material);
      if (b.kind === 'wall' || b.kind === 'building') {
        this.box(b.w + .08, .13, b.d + .09, b.x, b.h - .05, b.z, this.mat(0x778276));
        if (b.w > 3) for (let x = b.x - b.w / 2 + 2; x < b.x + b.w / 2; x += 3) this.box(.06, b.h - .1, b.d + .015, x, b.h / 2, b.z, this.mat(0x798376));
      }
      if (b.kind === 'crate') {
        for (const off of [-.33, .33]) this.box(.09, b.h + .025, b.d + .03, b.x + off * b.w, b.h / 2, b.z, darkMetal);
        this.box(b.w + .03, .09, b.d + .03, b.x, b.h * .2, b.z, darkMetal);
      }
      if (b.kind === 'sandbag') {
        for (let y = .18; y < b.h; y += .28) for (let x = -b.w / 2 + .35; x < b.w / 2; x += .7) this.box(.65, .25, b.d + .04, b.x + x, y, b.z, this.mat(y > .8 ? 0x979978 : 0x7d8369));
      }
      if (b.kind === 'rock') {
        // Flat collider stays inside irregular visual silhouette; gameplay shape is readable.
        const rock = this.mesh(new THREE.DodecahedronGeometry(1, 1), material, b.x, b.h * .5, b.z); rock.scale.set(b.w * .65, b.h * .72, b.d * .7); m.visible = false;
      }
    }
    // Shallow pitched metal roofs, ceilings, open door headers.
    const roof = this.mat(0x374949, .7, { metalness: .35 });
    for (const [x, z, w, d, h] of [[9, -7, 12.5, 10.5, 3.6], [-8, -5, 12.5, 12.5, 3.7]]) {
      this.box(w, .16, d, x, h, z, roof);
      for (let zz = z - d / 2; zz < z + d / 2; zz += .6) this.box(w, .05, .035, x, h + .1, zz, darkMetal);
      this.box(w - .4, .03, d - .4, x, .005, z, this.mat(0x828477));
    }
    this.box(4, .5, .36, 9, 3.25, -2, building);
    this.box(3, .5, .36, -9.5, 3.35, 1, building);
    this.box(.36, .5, 4, -2, 3.35, -5, building);
    this.sign('04 / RELAY', 9, 2.75, -1.79, 3.2);
    this.sign('STORES', -8, 2.6, 1.2, 2.5);
    this.sign('KESTREL', -7, 1.8, 15.31, 3.2);
    this.sign('RESTRICTED', 10, 1.8, 15.31, 2.5, '#cfb39a');
    // Interior props, offset from the navigation routes.
    this.box(1.3, .13, 2, 13.8, .52, -10, olive);
    for (const x of [13.3, 14.3]) for (const z of [-10.7, -9.3]) this.box(.07, .5, .07, x, .25, z, darkMetal);
    this.box(1, .11, .4, 13.8, .64, -10.6, this.mat(0xb7b9a1));
    this.box(1.7, .08, .7, 4.1, .9, -10.5, timber);
    this.box(.5, .4, .4, 4, 1.15, -10.5, darkMetal);
    this.lamp(9, 2.65, -1.65, 0xffc68a, 13);
    this.lamp(11, 3.1, -8, 0xffcf94, 13);
    this.lamp(-8, 3.15, -4, 0xb3c6ce, 11);
    this.lamp(-3, 2.55, 14.8, 0xffcc8e, 10);
    this.lamp(17.6, 2.5, 6.5, 0xe9c391, 10);
    // Fence detail on rear compound wall.
    const wire = this.mat(0x687978, .55, { metalness: .7 });
    for (let x = -18; x <= 18; x += 3) this.cylinder(.025, .025, .65, x, 3, -16, wire);
    for (const y of [2.85, 3.15]) this.box(36, .017, .017, 0, y, -16, wire);
    // Antenna, cables, and vent silhouettes.
    this.cylinder(.09, .16, 8, 13, 7.6, -10.5, darkMetal);
    for (const h of [8, 9.5, 11]) this.box(2.3, .045, .045, 13, h, -10.5, wire);
    const dish = this.mesh(new THREE.SphereGeometry(.9, 16, 10, 0, Math.PI), this.mat(0x9ba99d, .7, { side: THREE.DoubleSide }), 12.7, 7, -10.5); dish.rotation.z = .5;
    for (const x of [-11, -5]) this.box(1.2, .4, 1.1, x, 4, -7, darkMetal);
    // Shoreline, animated low waves, timber jetty, and extraction RHIB.
    this.water = this.mesh(new THREE.PlaneGeometry(240, 150, 75, 45), this.mat(0x153d50, .3, { metalness: .5, transparent: true, opacity: .94 }), 0, -.16, 108);
    this.water.rotation.x = -Math.PI / 2; this.water.castShadow = false;
    this.waterBase = this.water.geometry.attributes.position.array.slice();
    for (let i = 0; i < 10; i++) this.box(4, .16, .48, 26, .09, 29 + i * .6, timber);
    for (const x of [24.3, 27.7]) for (const z of [29, 32, 34.5]) this.cylinder(.1, .12, 1.2, x, -.15, z, timber);
    const boat = new THREE.Group(); boat.position.set(26, .1, 36.5); this.scene.add(boat); this.boat = boat;
    this.box(2.7, .35, 4.6, 0, .12, 0, darkMetal, boat);
    for (const x of [-1.5, 1.5]) { const pontoon = this.cylinder(.42, .42, 5, x, .35, 0, this.mat(0x263a3c), boat, 16); pontoon.rotation.x = Math.PI / 2; }
    const nose = this.cylinder(.42, .42, 3, 0, .35, -2.4, this.mat(0x263a3c), boat, 16); nose.rotation.z = Math.PI / 2;
    this.box(.7, 1, .7, 0, .5, 2.4, darkMetal, boat); this.box(1, .7, .55, 0, .65, -.4, olive, boat);
    this.lamp(EXTRACT.x, .35, EXTRACT.z, 0x77d6db, 8, 20);
    const beacon = this.mesh(new THREE.RingGeometry(3.7, 3.76, 64), new THREE.MeshBasicMaterial({ color: 0x83d4d1, transparent: true, opacity: .35, side: THREE.DoubleSide }), EXTRACT.x, .02, EXTRACT.z); beacon.rotation.x = -Math.PI / 2;
    // Original, deterministic-looking set dressing: scrub and distant coastal cliffs.
    const grassMat = this.mat(0x505f50, 1, { side: THREE.DoubleSide });
    const grassGeo = new THREE.ConeGeometry(.16, .7, 3); const grass = new THREE.InstancedMesh(grassGeo, grassMat, 500);
    const dummy = new THREE.Object3D(); let seed = 17; const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 500; i++) { const x = (rng() - .5) * 76, z = rng() * 63 - 30; const inside = Math.abs(x) < 19 && z < 17 && z > -17;
      dummy.position.set(x, inside ? -3 : .17, z); dummy.rotation.y = rng() * Math.PI; dummy.scale.set(1, .5 + rng() * .7, 1); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix); }
    grass.receiveShadow = true; this.scene.add(grass);
    const rockMat = this.mat(0x364c52);
    for (let i = 0; i < 30; i++) { const x = -75 + i * 5.5, z = -43 - rng() * 15; const rock = this.mesh(new THREE.DodecahedronGeometry(1, 0), rockMat, x, 1, z); rock.scale.set(6 + rng() * 6, 5 + rng() * 10, 5 + rng() * 6); }
    const starPositions = [];
    for (let i = 0; i < 300; i++) { const x = (rng() - .5) * 300, y = 40 + rng() * 100, z = (rng() - .5) * 300; starPositions.push(x, y, z); }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)); this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbdcbd5, size: .17, transparent: true, opacity: .5, fog: false })));
    this.mesh(new THREE.SphereGeometry(2, 20, 12), new THREE.MeshBasicMaterial({ color: 0xe0e8db, fog: false }), -60, 85, -110);
  }
  lamp(x, y, z, color, distance, intensity = 26) {
    this.box(.26, .11, .18, x, y, z, this.mat(color, .4, { emissive: color, emissiveIntensity: 2 }));
    const light = new THREE.PointLight(color, intensity, distance, 1.5); light.position.set(x, y - .12, z + .25); this.scene.add(light);
  }
  character(actor) {
    const g = new THREE.Group(), friendly = actor.type === 'friend', hostage = actor.type === 'hostage';
    const upper = new THREE.Group(); g.add(upper);
    const cloth = this.mat(hostage ? 0xb9b6a2 : friendly ? 0x66756a : 0x666052);
    const vest = this.mat(friendly ? 0x394d49 : 0x3b4241), skin = this.mat(0xa9967f), black = this.mat(0x222d2c), helmet = this.mat(friendly ? 0x6a7865 : 0x464b46);
    this.box(.5, .65, .28, 0, 1.16, 0, cloth, upper);
    if (!hostage) {
      this.box(.54, .43, .36, 0, 1.22, 0, vest, upper);
      for (const x of [-.17, 0, .17]) this.box(.13, .18, .1, x, 1.14, -.22, helmet, upper);
      this.box(.37, .4, .19, 0, 1.23, .23, vest, upper);
    }
    this.mesh(new THREE.SphereGeometry(.18, 10, 8), skin, 0, 1.67, 0, upper);
    if (!hostage) {
      const cap = this.mesh(new THREE.SphereGeometry(.215, 10, 8, 0, Math.PI * 2, 0, Math.PI * .6), helmet, 0, 1.72, 0, upper);
      this.box(.29, .08, .11, 0, 1.7, -.17, black, upper);
      if (friendly) {
        for (const x of [-.1, .1]) this.cylinder(.04, .04, .1, x, 1.79, -.24, black, upper).rotation.x = Math.PI / 2;
        this.box(.14, .045, .018, .28, 1.34, -.04, this.mat(0xa6d9cc, .6, { emissive: 0x49877c, emissiveIntensity: .5 }), upper);
      }
      cap.castShadow = true;
    }
    const limbs = [];
    for (const x of [-.16, .16]) {
      const leg = new THREE.Group(); leg.position.set(x, .88, 0); g.add(leg);
      this.box(.2, .35, .24, 0, -.175, 0, cloth, leg);
      const knee = new THREE.Group(); knee.position.y = -.35; leg.add(knee);
      this.box(.18, .35, .21, 0, -.175, 0, cloth, knee); this.box(.21, .15, .33, 0, -.43, -.035, black, knee);
      leg.userData.knee = knee; limbs.push(leg);
      const arm = this.box(.17, .55, .19, x * 1.95, 1.18, hostage ? .05 : -.14, cloth, upper); arm.rotation.x = hostage ? -.15 : -.65;
    }
    const rifle = new THREE.Group(); rifle.position.set(.19, 1.22, -.18); upper.add(rifle);
    if (!hostage) { this.box(.11, .14, .7, 0, -.04, -.28, black, rifle); this.box(.045, .045, .35, 0, 0, -.77, black, rifle); }
    g.userData = { limbs, upper, rifle }; this.scene.add(g); this.actorMeshes.set(actor.id, g); return g;
  }
  buildWeapon() {
    const g = new THREE.Group(); this.camera.add(g); this.gun = g;
    const metal = this.mat(0x222d30, .47, { metalness: .75 }), grip = this.mat(0x5c6553), edge = this.mat(0x627070, .45, { metalness: .6 });
    this.box(.105, .14, .29, 0, 0, -.19, metal, g);
    this.box(.09, .11, .35, 0, .015, -.48, grip, g);
    this.box(.08, .1, .25, 0, -.02, .07, grip, g);
    const mag = this.box(.065, .2, .1, 0, -.14, -.22, metal, g); mag.rotation.x = .15;
    const pistol = this.box(.065, .16, .08, 0, -.13, -.04, grip, g); pistol.rotation.x = -.3;
    this.cylinder(.025, .025, .3, 0, .025, -.79, metal, g).rotation.x = Math.PI / 2;
    this.cylinder(.034, .034, .19, 0, .025, -.96, edge, g).rotation.x = Math.PI / 2;
    for (let z = -.58; z < -.06; z += .035) this.box(.105, .014, .016, 0, .083, z, edge, g);
    // Open reflex optic leaves the centered reticle readable when aiming.
    this.box(.12, .018, .065, 0, .104, -.18, metal, g);
    for (const x of [-.054, .054]) this.box(.012, .09, .06, x, .153, -.18, metal, g);
    this.box(.12, .012, .06, 0, .2, -.18, metal, g);
    const glass = this.mesh(new THREE.PlaneGeometry(.091, .073), new THREE.MeshBasicMaterial({ color: 0x9ecfbe, transparent: true, opacity: .07, side: THREE.DoubleSide }), 0, .15, -.17, g);
    const glove = this.mat(0x5f6959), sleeve = this.mat(0x64746a);
    const arm = this.box(.12, .13, .37, -.12, -.11, -.31, sleeve, g); arm.rotation.y = -.38;
    this.box(.13, .12, .15, -.06, -.07, -.47, glove, g);
    const right = this.box(.13, .15, .34, .1, -.22, .06, sleeve, g); right.rotation.x = -.6;
    this.box(.1, .11, .12, .04, -.13, -.04, glove, g);
    this.flash = this.mesh(new THREE.ConeGeometry(.085, .3, 6), new THREE.MeshBasicMaterial({ color: 0xffd58c, transparent: true, opacity: .9 }), 0, .025, -1.13, g); this.flash.rotation.x = -Math.PI / 2; this.flash.visible = false;
    this.flashLight = new THREE.PointLight(0xffbc65, 0, 5); this.flashLight.position.set(0, .1, -.9); g.add(this.flashLight);
    this.torch = new THREE.SpotLight(0xe4eddb, 0, 35, .34, .65, 1.3); this.torch.position.set(.1, -.1, -.3); this.torch.target.position.set(0, 0, -25); this.camera.add(this.torch, this.torch.target);
    g.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
  }
  bind(sim) {
    for (const mesh of this.actorMeshes.values()) { this.scene.remove(mesh); mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
    this.actorMeshes.clear(); for (const actor of [...sim.friends, ...sim.enemies, sim.hostage]) this.character(actor);
    for (const effect of this.effects) { this.scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); } this.effects = [];
  }
  event(e) {
    if (e.type === 'shot') {
      if (e.faction === 'player') { this.kick = 1; this.flashTimer = .045; }
      else {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(e.from.x, e.from.y, e.from.z), new THREE.Vector3(e.to.x, e.to.y + (Math.random() - .5) * .4, e.to.z)]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: e.faction === 'friend' ? 0xb8cb9f : 0xffc18c, transparent: true, opacity: .65 })); this.scene.add(line); this.effects.push({ mesh: line, life: .06 });
      }
    }
    if (e.type === 'impact') {
      const mesh = this.mesh(new THREE.SphereGeometry(.07, 5, 4), new THREE.MeshBasicMaterial({ color: 0xc7bda0, transparent: true, opacity: .7 }), e.point.x, e.point.y, e.point.z);
      this.effects.push({ mesh, life: .23, dust: true });
    }
  }
  render(sim, dt, mode) {
    const t = performance.now() / 1000, p = sim.player, playingView = mode !== 'menu';
    if (playingView) {
      const eye = p.crouch ? 1.02 : 1.68;
      this.bob += dt * (p.moving ? p.sprint ? 15 : 9 : 0);
      const bob = p.moving ? Math.sin(this.bob) * (p.aim ? .008 : p.sprint ? .043 : .023) : 0;
      this.camera.position.x = p.x; this.camera.position.z = p.z;
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y || eye, eye + bob, Math.min(1, dt * 14));
      this.camera.rotation.set(p.pitch + this.kick * .008, p.yaw, p.moving && !p.aim ? Math.sin(this.bob * .5) * .003 : 0);
      const fov = p.aim ? 53 : p.sprint ? 83 : 76; this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, fov, Math.min(1, dt * 12)); this.camera.updateProjectionMatrix();
      const reload = p.reload ? Math.sin((1 - p.reload / 2.35) * Math.PI) : 0;
      const x = p.aim ? 0 : .24, y = p.aim ? -.15 : -.24, z = p.aim ? -.2 : -.32;
      this.gun.position.lerp(new THREE.Vector3(x + (p.moving && !p.aim ? Math.sin(this.bob * .5) * .012 : 0), y - reload * .22 - (p.sprint ? .1 : 0), z + this.kick * .05), Math.min(1, dt * 16));
      this.gun.rotation.set(this.kick * .035 - reload * .4 - (p.sprint ? .25 : 0), reload * .25, reload * -.55);
      this.torch.intensity = p.light ? 38 : 0;
    } else {
      this.camera.position.set(28 + Math.sin(t * .035) * 3, 14, 31); this.camera.lookAt(0, 1, -3); this.camera.fov = 66; this.camera.updateProjectionMatrix(); this.torch.intensity = 0;
    }
    this.gun.visible = playingView;
    for (const actor of [...sim.enemies, ...sim.friends, sim.hostage]) {
      const mesh = this.actorMeshes.get(actor.id); if (!mesh) continue;
      mesh.position.set(actor.x, actor.hp <= 0 ? .2 : 0, actor.z); mesh.rotation.y = actor.yaw;
      mesh.rotation.z = actor.hp <= 0 ? Math.PI / 2 : 0;
      const blend = Math.min(1, dt * 16), crouch = actor.hp > 0 && actor.crouch;
      mesh.userData.upper.position.y = THREE.MathUtils.lerp(mesh.userData.upper.position.y, crouch ? -.63 : 0, blend);
      mesh.userData.rifle.rotation.x = THREE.MathUtils.lerp(mesh.userData.rifle.rotation.x, actor.reload ? -.6 : 0, blend);
      mesh.userData.limbs.forEach((leg, i) => {
        const stride = actor.hp > 0 && actor.moving ? Math.sin(sim.time * 9 + i * Math.PI) * .4 : 0;
        leg.position.y = THREE.MathUtils.lerp(leg.position.y, crouch ? .46 : .88, blend);
        leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, crouch ? -1.2 : stride, blend);
        leg.userData.knee.rotation.x = THREE.MathUtils.lerp(leg.userData.knee.rotation.x, crouch ? 2.1 : Math.max(0, -stride), blend);
      });
    }
    this.kick = Math.max(0, this.kick - dt * 9); this.flashTimer = Math.max(0, (this.flashTimer || 0) - dt);
    this.flash.visible = this.flashTimer > 0; this.flashLight.intensity = this.flashTimer > 0 ? 7 : 0;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.life -= dt; if (e.dust) e.mesh.scale.multiplyScalar(1 + dt * 5);
      if (e.life <= 0) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); this.effects.splice(i, 1); }
    }
    const pos = this.water.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.array[i * 3 + 2] = Math.sin(this.waterBase[i * 3] * .35 + t * .8) * .07 + Math.sin(this.waterBase[i * 3 + 1] * .9 + t * 1.1) * .045;
    pos.needsUpdate = true; this.boat.position.y = .1 + Math.sin(t) * .045; this.boat.rotation.z = Math.sin(t * .8) * .012;
    this.renderer.render(this.scene, this.camera);
  }
  project(point) { const v = new THREE.Vector3(point.x, point.y ?? 2.5, point.z); v.project(this.camera); return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight, visible: v.z < 1 && v.z > -1 }; }
  direction() { return this.camera.getWorldDirection(new THREE.Vector3()); }
}
