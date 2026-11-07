import * as THREE from 'three';
import { createActorRig, animateActorRig } from './actor-view.js';
import { OperatorLibrary } from './operators.js';
import { SOLIDS, EXTRACT, HOSTAGE } from './world.js';
import { weaponOrientation } from './weapon.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SurfaceLibrary, scaleBoxUV, boulderGeometry, skyTexture, coastalGrass, batchStaticWorld, randomSequence } from './appearance.js';

export class GameView {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2(0x1b2530, .009);
    this.camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, .05, 240); this.camera.rotation.order = 'YXZ'; this.scene.add(this.camera);
    this.actorMeshes = new Map(); this.effects = []; this.bob = 0; this.kick = 0;
    this.materials = {}; this.surfaces = new SurfaceLibrary(this.renderer); this.operators = new OperatorLibrary();
    this.assetsReady = Promise.all([this.surfaces.ready, this.operators.ready]).then(results => {
      if (this.boundSim && this.operators.template) this.bind(this.boundSim);
      return results.flat();
    });
    this.buildWorld(); batchStaticWorld(this.scene); this.buildWeapon();
    this.composer = new EffectComposer(this.renderer);
    this.composer.renderTarget1.samples = this.composer.renderTarget2.samples = 2;
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .22, .45, 1.3); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass()); this.highQuality = true;
    window.addEventListener('resize', () => { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight); });
  }
  mat(color, roughness = .9, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness, ...extra }); }
  mesh(geometry, material, x, y, z, parent = this.scene) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    if (parent === this.scene) mesh.layers.enable(1); // Static geometry for cached local-light shadows.
    parent.add(mesh); return mesh;
  }
  box(w, h, d, x, y, z, material, parent = this.scene) {
    const geo = new THREE.BoxGeometry(w, h, d);
    if (material.userData.tileMeters) scaleBoxUV(geo, w, h, d, material.userData.tileMeters);
    return this.mesh(geo, material, x, y, z, parent);
  }
  rounded(w, h, d, x, y, z, material, parent = this.scene, radius = .025) {
    return this.mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3)), material, x, y, z, parent);
  }
  cylinder(r, rt, h, x, y, z, material, parent = this.scene, segments = 10) { return this.mesh(new THREE.CylinderGeometry(r, rt, h, segments), material, x, y, z, parent); }
  limb(radius, length, x, y, z, material, parent) { return this.mesh(new THREE.CapsuleGeometry(radius, Math.max(.01, length - radius * 2), 5, 10), material, x, y, z, parent); }
  limbBetween(radius, start, end, material, parent) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end), center = a.clone().add(b).multiplyScalar(.5);
    const mesh = this.limb(radius, a.distanceTo(b), center.x, center.y, center.z, material, parent);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return mesh;
  }
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
    const sky = skyTexture(); this.scene.background = sky;
    const pmrem = new THREE.PMREMGenerator(this.renderer); this.skyEnvironment = pmrem.fromEquirectangular(sky); this.scene.environment = this.skyEnvironment.texture; this.scene.environmentIntensity = .3; pmrem.dispose();
    const moon = new THREE.DirectionalLight(0xaec4dd, 1.65); moon.position.set(-25, 40, 12); moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048); Object.assign(moon.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: .5, far: 120 }); moon.shadow.bias = -.0003; moon.shadow.normalBias = .035; this.scene.add(moon);
    this.scene.add(new THREE.HemisphereLight(0xa4b7c9, 0x38342e, .65));
    const sand = this.surfaces.material('coast_sand_02', 4, 0xc0b8a6, .85);
    this.box(180, .3, 140, 0, -.2, -36, sand);
    const wall = this.surfaces.material('concrete_wall_003', 4.2, 0xb3b5a7, .65);
    const building = this.surfaces.material('concrete_wall_003', 3.4, 0xc0beb0, .55);
    const rockSurface = this.surfaces.material('rock_boulder_cracked', 2.5, 0x8e9696, 1);
    const olive = this.mat(0x535d48), darkMetal = this.mat(0x343b3c, .55, { metalness: .65 }), timber = this.surfaces.material('weathered_planks', 2, 0xb0a08b, .65);
    const coping = this.mat(0x7b8079), seam = this.mat(0x575d59), bag = this.surfaces.fabric(0x968b67);
    this.materials = { olive, darkMetal, timber, wall, building, rockSurface, coping, seam };
    const courtyard = this.surfaces.material('coast_sand_02', 3.5, 0x747b76, .65);
    this.box(35, .025, 30, 0, -.02, -.1, courtyard);
    for (const b of SOLIDS) {
      let material = b.kind === 'building' ? building : b.kind === 'crate' ? timber : b.kind === 'rock' ? rockSurface : b.kind === 'sandbag' ? bag : b.kind === 'machine' ? olive : wall;
      if (b.kind === 'rock') this.mesh(boulderGeometry(b.w, b.h, b.d, b.x), material, b.x, b.h * .48, b.z);
      else if (b.kind !== 'sandbag') this.box(b.w, b.h, b.d, b.x, b.h / 2, b.z, material);
      if (b.kind === 'wall' || b.kind === 'building') {
        this.box(b.w + .08, .13, b.d + .09, b.x, b.h - .05, b.z, coping);
        if (b.w > 3) for (let x = b.x - b.w / 2 + 2; x < b.x + b.w / 2; x += 3) this.box(.07, b.h - .1, b.d + .04, x, b.h / 2, b.z, seam);
        this.box(b.w + .025, .17, b.d + .025, b.x, .085, b.z, seam);
      }
      if (b.kind === 'crate') {
        for (const off of [-.33, .33]) this.box(.09, b.h + .025, b.d + .03, b.x + off * b.w, b.h / 2, b.z, darkMetal);
        this.box(b.w + .03, .09, b.d + .03, b.x, b.h * .2, b.z, darkMetal);
      }
      if (b.kind === 'sandbag') {
        for (let row = 0; row < 4; row++) for (let col = 0; col < 7; col++) {
          const sack = this.rounded(b.w / 7 + .025, .29, b.d + .05, b.x - b.w / 2 + (col + .5) * b.w / 7, .145 + row * .285, b.z, bag, this.scene, .12);
          sack.rotation.y = Math.sin(row * 9 + col) * .035;
          this.box(b.w / 7 - .08, .009, .012, sack.position.x, sack.position.y, b.z + b.d / 2 + .028, seam);
        }
      }
    }
    // Shallow pitched metal roofs, ceilings, open door headers.
    const roof = this.mat(0x374949, .7, { metalness: .35 });
    for (const [x, z, w, d, h] of [[9, -7, 12.5, 10.5, 3.6], [-8, -5, 12.5, 12.5, 3.7]]) {
      this.box(w, .16, d, x, h, z, roof);
      for (let zz = z - d / 2; zz < z + d / 2; zz += .6) this.box(w, .05, .035, x, h + .1, zz, darkMetal);
      this.box(w - .4, .03, d - .4, x, .005, z, building);
      // Eaves, gutter and downpipe ground the roof in a constructed building.
      this.box(w + .2, .16, .16, x, h - .05, z + d / 2, darkMetal);
      this.cylinder(.055, .055, h, x + w / 2 - .22, h / 2, z + d / 2, darkMetal);
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
    this.lamp(-3.4, 2.55, 15.45, 0xffcc8e, 10);
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
    this.dressCompound();
    // Shoreline, animated low waves, timber jetty, and extraction RHIB.
    const waterMaterial = this.mat(0x162c36, .22, { metalness: .45, envMapIntensity: 1.5 });
    this.seaTime = { value: 0 };
    waterMaterial.onBeforeCompile = shader => {
      shader.uniforms.seaTime = this.seaTime;
      shader.vertexShader = 'varying vec3 vSeaPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvSeaPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = 'uniform float seaTime; varying vec3 vSeaPosition;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(normal + mat3(viewMatrix) * vec3(sin(vSeaPosition.x * 3.0 + seaTime) * .12 + cos(vSeaPosition.z * 6.0 + seaTime * 1.4) * .07, 0.0, cos(vSeaPosition.z * 2.8 - seaTime) * .1));');
    };
    this.water = this.mesh(new THREE.PlaneGeometry(240, 150, 75, 45), waterMaterial, 0, -.16, 108); this.water.userData.dynamic = true;
    this.water.rotation.x = -Math.PI / 2; this.water.castShadow = false;
    this.waterBase = this.water.geometry.attributes.position.array.slice();
    for (let i = 0; i < 10; i++) this.box(4, .16, .48, 26, .09, 29 + i * .6, timber);
    for (const x of [24.3, 27.7]) for (const z of [29, 32, 34.5]) this.cylinder(.1, .12, 1.2, x, -.15, z, timber);
    const boat = new THREE.Group(); boat.position.set(26, .1, 36.5); this.scene.add(boat); this.boat = boat;
    this.box(2.7, .35, 4.6, 0, .12, 0, darkMetal, boat);
    const rubber = this.mat(0x293435, .82), ropeMat = this.mat(0x878472, .97);
    const hullCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.5, .35, 2.35), new THREE.Vector3(-1.5, .35, -.9), new THREE.Vector3(-1.1, .38, -2.4), new THREE.Vector3(0, .4, -2.75), new THREE.Vector3(1.1, .38, -2.4), new THREE.Vector3(1.5, .35, -.9), new THREE.Vector3(1.5, .35, 2.35)]);
    this.mesh(new THREE.TubeGeometry(hullCurve, 48, .4, 16, false), rubber, 0, 0, 0, boat);
    for (const x of [-1.5, 1.5]) this.mesh(new THREE.SphereGeometry(.4, 16, 12), rubber, x, .35, 2.35, boat);
    this.rounded(.7, .95, .65, 0, .5, 2.4, darkMetal, boat, .16); this.rounded(.85, .65, .6, 0, .65, -.4, olive, boat, .08);
    const screen = this.rounded(.75, .36, .045, 0, 1.1, -.5, this.mat(0x697b80, .2, { metalness: .4 }), boat); screen.rotation.x = -.3;
    for (const z of [.4, 1.2]) this.rounded(1.8, .16, .4, 0, .55, z, rubber, boat, .07);
    for (const side of [-1, 1]) {
      for (const z of [-1.4, -.4, .6, 1.6]) this.rounded(.09, .08, .19, side * 1.65, .69, z, darkMetal, boat);
      const rope = new THREE.CatmullRomCurve3([new THREE.Vector3(side * 1.65, .71, -1.4), new THREE.Vector3(side * 1.78, .63, 0), new THREE.Vector3(side * 1.65, .71, 1.6)]);
      this.mesh(new THREE.TubeGeometry(rope, 16, .018, 6, false), ropeMat, 0, 0, 0, boat);
    }
    this.lamp(EXTRACT.x, .35, EXTRACT.z, 0x77d6db, 8, 20);
    const beacon = this.mesh(new THREE.RingGeometry(3.7, 3.76, 64), new THREE.MeshBasicMaterial({ color: 0x83d4d1, transparent: true, opacity: .35, side: THREE.DoubleSide }), EXTRACT.x, .02, EXTRACT.z); beacon.rotation.x = -Math.PI / 2;
    this.windTime = coastalGrass(this.scene);
    const rng = randomSequence(17);
    for (let i = 0; i < 25; i++) {
      const x = -75 + i * 6, z = -46 - rng() * 10, h = 5 + rng() * 9;
      this.mesh(boulderGeometry(9 + rng() * 5, h, 9, i), rockSurface, x, h * .35 - 1, z);
    }
    for (const side of [-1, 1]) for (let i = 0; i < 8; i++) {
      const h = 2 + rng() * 3;
      this.mesh(boulderGeometry(6, h, 7, i * 7), rockSurface, side * (40 + rng() * 4), h * .35, 28 - i * 8);
    }
    this.shoreDetails();
    const starPositions = [];
    for (let i = 0; i < 65; i++) { const x = (rng() - .5) * 300, y = 70 + rng() * 100, z = (rng() - .5) * 300; starPositions.push(x, y, z); }
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3)); this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbdcbd5, size: .17, transparent: true, opacity: .5, fog: false })));
    this.mesh(new THREE.SphereGeometry(.85, 20, 12), new THREE.MeshBasicMaterial({ color: 0xc4cbd1, fog: false }), -60, 85, -110);
  }
  lamp(x, y, z, color, distance, intensity = 26) {
    this.rounded(.32, .16, .24, x, y + .07, z, this.materials.darkMetal);
    this.box(.24, .025, .15, x, y - .02, z + .035, this.mat(color, .4, { emissive: color, emissiveIntensity: 4 }));
    const light = new THREE.SpotLight(color, intensity * 4, distance, 1.18, .65, 1.5); light.position.set(x, y - .08, z + .15); light.target.position.set(x, -.2, z + .8);
    light.castShadow = y > 1; light.shadow.mapSize.set(512, 512); light.shadow.bias = -.0003; light.shadow.normalBias = .025;
    light.shadow.camera.layers.set(1); light.shadow.autoUpdate = false; light.shadow.needsUpdate = true;
    this.scene.add(light, light.target);
  }
  dressCompound() {
    const { darkMetal, seam, timber, coping, olive } = this.materials;
    const rust = this.mat(0x665247, .87, { metalness: .25 });
    const rubber = this.mat(0x1c2528, .95), glass = this.mat(0x233339, .24, { metalness: .5 });
    for (const [x, z] of [[5, -1.79], [13, -1.79], [-5, 1.2]]) {
      this.box(1.5, .9, .08, x, 1.95, z, darkMetal);
      this.box(1.32, .72, .09, x, 1.95, z + .02, glass);
      for (const offset of [-.5, -.25, 0, .25, .5]) this.box(.025, .82, .04, x + offset, 1.95, z + .085, rust);
      this.box(1.65, .12, .24, x, 1.46, z + .04, coping);
    }
    for (const x of [6.95, 11.05]) this.box(.1, 3, .14, x, 1.5, -1.79, darkMetal);
    this.box(4.2, .1, .14, 9, 2.96, -1.79, darkMetal);
    for (const [x, z] of [[14, -1.78], [-13.5, 1.21], [-5, 15.3]]) {
      this.rounded(.4, .65, .14, x, 1.1, z, olive);
      this.cylinder(.018, .018, 1.3, x, 2, z, rust, this.scene, 8);
      this.box(.12, .035, .05, x + .09, 1.1, z + .09, darkMetal);
      for (let i = 0; i < 4; i++) this.box(.22, .012, .015, x, .9 + i * .045, z + .08, rubber);
    }
    const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(-3, 3.1, 14.8), new THREE.Vector3(-1, 2.85, 14.8), new THREE.Vector3(2, 3.1, 14.8), new THREE.Vector3(9, 4.2, -2)]);
    this.mesh(new THREE.TubeGeometry(cable, 30, .013, 5, false), rubber, 0, 0, 0);
    // Louvers and service fittings stay on the existing generator collision volume.
    for (let x = 11.65; x <= 14.35; x += .18) this.box(.07, .86, .045, x, .8, -13.17, darkMetal);
    this.cylinder(.07, .07, .65, 14, 1.7, -14, rust);
    this.rounded(.7, .27, .5, 12.4, 1.6, -14, seam);
    for (const [x, z] of [[-10.8, -7], [-9.3, -7], [12, 8]]) {
      this.cylinder(.23, .23, .42, x, 1.7, z, olive, this.scene, 20);
      this.cylinder(.235, .235, .025, x, 1.91, z, darkMetal, this.scene, 20);
    }
    // Interior furniture detail, kept against the walls and outside walkable doorways.
    for (const y of [.45, 1.1, 1.75]) this.box(.48, .06, 2, 14.55, y, -5, timber);
    for (const z of [-5.9, -4.1]) this.box(.055, 2.1, .055, 14.55, 1.05, z, darkMetal);
    for (const z of [-5.6, -5, -4.5]) this.rounded(.32, .3, .35, 14.55, 1.29, z, olive);
    this.sign('KEEP CLEAR', 8.98, .045, -.75, 1.6, '#a39a77').rotation.x = -Math.PI / 2;
  }
  shoreDetails() {
    const rng = randomSequence(7), pebbleGeo = new THREE.IcosahedronGeometry(1, 0);
    const pebbles = new THREE.InstancedMesh(pebbleGeo, this.materials.rockSurface, 1100), dummy = new THREE.Object3D();
    for (let i = 0; i < 1100; i++) {
      const x = (rng() - .5) * 73, z = rng() * 63 - 30, size = .018 + rng() * .065;
      dummy.position.set(x, -.03, z); dummy.scale.set(size * 1.4, size * .65, size); dummy.rotation.set(rng(), rng() * 6, rng()); dummy.updateMatrix(); pebbles.setMatrixAt(i, dummy.matrix);
      pebbles.setColorAt(i, new THREE.Color().setScalar(.55 + rng() * .45));
    }
    pebbles.receiveShadow = true; this.scene.add(pebbles);
    const wet = this.surfaces.material('coast_sand_02', 4, 0x56564d, .35); wet.roughness = .36;
    this.box(180, .008, 3.8, 0, -.043, 32.1, wet);
    const foamMaterial = new THREE.ShaderMaterial({
      uniforms: { time: this.seaTime }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `varying vec2 vUv; uniform float time;
        void main(){float crest=.44+sin(vUv.x*37.+time*.4)*.08+sin(vUv.x*121.-time*.7)*.025;
        float edge=exp(-pow((vUv.y-crest)*38.,2.)); float breakup=.45+.55*sin(vUv.x*630.+sin(vUv.x*72.)*6.);
        float wash=exp(-pow((vUv.y-crest+.12)*8.,2.))*.1;
        gl_FragColor=vec4(.48,.57,.61,(edge*breakup*.23+wash)*(.7+.3*sin(time*.65)));}`,
    });
    const foam = this.mesh(new THREE.PlaneGeometry(180, 4), foamMaterial, 0, -.016, 34.2); foam.rotation.x = -Math.PI / 2; foam.castShadow = false;
    // Small wet patches reflect lamps; feathered boundaries avoid hard polygon edges.
    const puddleMaterial = this.mat(0x273335, .13, { metalness: .6, transparent: true, opacity: .65, depthWrite: false });
    puddleMaterial.onBeforeCompile = shader => {
      shader.vertexShader = 'varying vec2 vPuddle;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPuddle = uv;');
      shader.fragmentShader = 'varying vec2 vPuddle;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat edge = length((vPuddle - .5) * 2.0) + sin(vPuddle.x * 27.0) * .05 + sin(vPuddle.y * 33.0) * .06; diffuseColor.a *= 1.0 - smoothstep(.65, 1.0, edge);');
    };
    for (const [x, z, w, d] of [[-3, 19, 4, 1.8], [4, 13, 3, 1.5], [16, 5.8, 2.5, 1.2], [-3, 2, 2, 1], [7, -1, 2, .8], [25, 26, 2.5, 1.5]]) {
      const puddle = this.mesh(new THREE.PlaneGeometry(w, d), puddleMaterial, x, .007, z); puddle.rotation.x = -Math.PI / 2; puddle.castShadow = false;
    }
  }
  character(actor) {
    const mesh = this.operators?.create(this, actor) || createActorRig(this, actor);
    this.scene.add(mesh); this.actorMeshes.set(actor.id, mesh); return mesh;
  }
  buildWeapon() {
    const g = new THREE.Group(); this.camera.add(g); this.gun = g;
    const metal = this.mat(0x222d30, .47, { metalness: .75 }), grip = this.mat(0x5c6553), edge = this.mat(0x627070, .45, { metalness: .6 });
    this.rounded(.09, .115, .29, 0, 0, -.19, metal, g, .018);
    this.rounded(.08, .1, .35, 0, .015, -.48, grip, g, .02);
    this.rounded(.07, .095, .25, 0, -.02, .07, grip, g, .02);
    const mag = this.rounded(.06, .2, .1, 0, -.14, -.22, metal, g, .012); mag.rotation.x = .15;
    const pistol = this.rounded(.06, .16, .08, 0, -.13, -.04, grip, g, .02); pistol.rotation.x = -.3;
    this.cylinder(.025, .025, .3, 0, .025, -.79, metal, g).rotation.x = Math.PI / 2;
    this.cylinder(.034, .034, .19, 0, .025, -.96, edge, g).rotation.x = Math.PI / 2;
    for (let z = -.58; z < -.06; z += .035) this.box(.105, .014, .016, 0, .083, z, edge, g);
    const recess = this.mat(0x0b1113, .88);
    for (const side of [-1, 1]) {
      for (let z = -.6; z < -.34; z += .055) this.rounded(.003, .023, .034, side * .041, .018, z, recess, g, .004);
      for (const z of [-.28, -.12]) { const pin = this.cylinder(.009, .009, .004, side * .047, -.017, z, edge, g, 12); pin.rotation.z = Math.PI / 2; }
      for (let z = -.25; z < -.16; z += .025) this.rounded(.003, .12, .007, side * .031, -.16, z, grip, g, .002);
    }
    this.rounded(.006, .038, .087, .047, .015, -.2, recess, g, .007);
    this.rounded(.009, .008, .085, .051, -.004, -.2, edge, g, .003);
    this.rounded(.035, .045, .022, .04, .035, -.09, grip, g, .007);
    for (let z = -.91; z > -1.04; z -= .025) this.cylinder(.035, .035, .004, 0, .025, z, metal, g, 24).rotation.x = Math.PI / 2;
    // Open reflex optic leaves the centered reticle readable when aiming.
    this.rounded(.11, .015, .065, 0, .104, -.18, metal, g, .006);
    for (const x of [-.05, .05]) this.rounded(.009, .09, .06, x, .153, -.18, metal, g, .004);
    this.rounded(.11, .009, .06, 0, .2, -.18, metal, g, .004);
    const glass = this.mesh(new THREE.PlaneGeometry(.091, .073), new THREE.MeshBasicMaterial({ color: 0x9ecfbe, transparent: true, opacity: .07, side: THREE.DoubleSide }), 0, .15, -.17, g);
    this.mesh(new THREE.SphereGeometry(.0009, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff543b, toneMapped: false, fog: false }), 0, .15, -.185, g);
    const glove = this.surfaces.fabric(0x5f6959), sleeve = this.surfaces.fabric(0x64746a);
    this.limbBetween(.058, [-.26, -.29, -.02], [-.06, -.08, -.45], sleeve, g);
    this.rounded(.11, .1, .13, -.045, -.07, -.47, glove, g, .035);
    this.limbBetween(.065, [.23, -.38, .28], [.055, -.14, -.02], sleeve, g);
    this.rounded(.09, .11, .12, .04, -.13, -.04, glove, g, .03);
    for (let i = 0; i < 4; i++) {
      const finger = this.limb(.014, .095, .012, -.058, -.51 + i * .025, glove, g); finger.rotation.z = Math.PI / 2;
      this.rounded(.075, .018, .025, .02, -.105 - i * .022, -.065, glove, g, .008);
    }
    this.rounded(.03, .065, .03, -.055, -.015, -.45, glove, g, .014).rotation.x = -.55;
    this.flash = this.mesh(new THREE.ConeGeometry(.085, .3, 6), new THREE.MeshBasicMaterial({ color: 0xffd58c, transparent: true, opacity: .9 }), 0, .025, -1.13, g); this.flash.rotation.x = -Math.PI / 2; this.flash.visible = false;
    this.flashLight = new THREE.PointLight(0xffbc65, 0, 5); this.flashLight.position.set(0, .1, -.9); g.add(this.flashLight);
    this.torch = new THREE.SpotLight(0xe4eddb, 0, 35, .34, .65, 1.3); this.torch.position.set(.1, -.1, -.3); this.torch.target.position.set(0, 0, -25); this.camera.add(this.torch, this.torch.target);
    this.torch.castShadow = true; this.torch.shadow.mapSize.set(1024, 1024); this.torch.shadow.bias = -.0003; this.torch.shadow.normalBias = .015;
    // Very low broad fill represents reflected skylight on the near weapon.
    const weaponFill = new THREE.PointLight(0xaabccc, .14, 1.8, 1); weaponFill.position.set(-.3, .25, .15); this.camera.add(weaponFill);
    g.traverse(m => { if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false; } });
  }
  bind(sim) {
    this.boundSim = sim; this.kick = 0; this.flashTimer = 0; this.lastActorTime = sim.time;
    for (const mesh of this.actorMeshes.values()) {
      this.scene.remove(mesh);
      if (mesh.userData.dispose) mesh.userData.dispose();
      else mesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this.actorMeshes.clear(); for (const actor of [...sim.friends, ...sim.enemies, sim.hostage]) this.character(actor);
    for (const effect of this.effects) { this.scene.remove(effect.mesh); effect.mesh.geometry.dispose(); effect.mesh.material.dispose(); } this.effects = [];
  }
  event(e) {
    if (e.type === 'shot') {
      if (e.faction === 'player') { this.kick = 1; this.flashTimer = .045; }
      else {
        const rig = this.actorMeshes.get(e.actorId);
        if (rig) rig.userData.motion.recoil = 1;
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
      const w = p.weapon, orientation = weaponOrientation(p);
      this.bob = w.stepPhase;
      this.camera.position.x = p.x; this.camera.position.z = p.z;
      this.camera.position.y = w.eye;
      this.camera.rotation.set(orientation.pitch, orientation.yaw, 0);
      this.camera.fov = 76 - w.aim * 23 + (p.sprint ? 7 : 0); this.camera.updateProjectionMatrix();
      const reload = p.reload ? Math.sin((1 - p.reload / 2.35) * Math.PI) : 0;
      const x = .24 * (1 - w.aim), y = -.24 + w.aim * .09, z = -.32 + w.aim * .12, lowered = w.lowReady / .3;
      this.gun.position.set(x + Math.sin(this.bob * .5) * .012 * w.motion * (1 - w.aim), y - reload * .22 - lowered * .1, z + this.kick * .05);
      this.gun.rotation.set(this.kick * .035 - reload * .4 - lowered * .25, reload * .25, reload * -.55);
      this.torch.intensity = p.light ? 38 : 0;
    } else {
      this.camera.position.set(28 + Math.sin(t * .035) * 3, 14, 31); this.camera.lookAt(0, 1, -3); this.camera.fov = 66; this.camera.updateProjectionMatrix(); this.torch.intensity = 0;
    }
    this.gun.visible = playingView;
    const actorDt = Math.max(0, Math.min(.05, sim.time - this.lastActorTime)); this.lastActorTime = sim.time;
    for (const actor of [...sim.enemies, ...sim.friends, sim.hostage]) {
      const mesh = this.actorMeshes.get(actor.id);
      if (mesh) animateActorRig(mesh, actor, actorDt, sim.time);
    }
    this.kick = Math.max(0, this.kick - dt * 9); this.flashTimer = Math.max(0, (this.flashTimer || 0) - dt);
    this.flash.visible = this.flashTimer > 0; this.flashLight.intensity = this.flashTimer > 0 ? 7 : 0;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]; e.life -= dt; if (e.dust) e.mesh.scale.multiplyScalar(1 + dt * 5);
      if (e.life <= 0) { this.scene.remove(e.mesh); e.mesh.geometry.dispose(); e.mesh.material.dispose(); this.effects.splice(i, 1); }
    }
    this.windTime.value = t; this.seaTime.value = t;
    const pos = this.water.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.array[i * 3 + 2] = Math.sin(this.waterBase[i * 3] * .35 + t * .8) * .07 + Math.sin(this.waterBase[i * 3 + 1] * .9 + t * 1.1) * .045;
    pos.needsUpdate = true; this.boat.position.y = .1 + Math.sin(t) * .045; this.boat.rotation.z = Math.sin(t * .8) * .012;
    this.composer.render();
  }
  setQuality(high) {
    this.highQuality = high; this.bloom.enabled = high;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, high ? 1.6 : 1));
    this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.torch.castShadow = high;
  }
  project(point) { const v = new THREE.Vector3(point.x, point.y ?? 2.5, point.z); v.project(this.camera); return { x: (v.x * .5 + .5) * innerWidth, y: (-v.y * .5 + .5) * innerHeight, visible: v.z < 1 && v.z > -1 }; }
  direction() { return this.camera.getWorldDirection(new THREE.Vector3()); }
}
