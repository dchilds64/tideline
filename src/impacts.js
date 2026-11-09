import * as THREE from 'three';

const styles = {
  concrete: { color: 0xb7b09b, rim: [145, 139, 121], size: .115, dust: .36 },
  stone: { color: 0x8f9186, rim: [118, 121, 111], size: .10, dust: .28 },
  wood: { color: 0xa78a59, rim: [155, 122, 76], size: .10, dust: .16 },
  metal: { color: 0xc0b9a2, rim: [156, 159, 148], size: .065, dust: .07 },
  sand: { color: 0xb9ad87, rim: [116, 108, 87], size: .13, dust: .46 },
};
const normalAxis = new THREE.Vector3(0, 0, 1), up = new THREE.Vector3(0, 1, 0);

// Original procedural RGBA textures. Their transparent boundary and lit chip
// rim sit on the surface instead of using a bright, opaque bullet-hole sticker.
function texture(kind) {
  const size = 64, bytes = new Uint8Array(size * size * 4), rim = styles[kind]?.rim;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x + .5) / size * 2 - 1, v = (y + .5) / size * 2 - 1;
    const angle = Math.atan2(v, u), noise = Math.sin(x * 43.13 + y * 17.71) * 43758.5453 % 1;
    const radius = Math.hypot(u, v), edge = .65 + Math.sin(angle * 7) * .075 + Math.cos(angle * 13) * .035;
    const i = (y * size + x) * 4;
    if (kind === 'dust') {
      bytes.set([255, 255, 255, Math.max(0, (1 - radius) ** 2 * .5 + noise * .025) * 255 * (radius < 1)], i);
    } else {
      const chip = radius > edge * .45, crack = Math.abs(Math.sin(angle * 5 + radius * 3)) < .07 && radius > .2;
      const light = chip && !crack ? .78 + noise * .22 + v * .22 : .16 + radius * .12;
      const alpha = THREE.MathUtils.clamp((edge - radius) * 18, 0, 1);
      bytes.set([...rim.map(c => c * light), alpha * 255], i);
    }
  }
  const map = new THREE.DataTexture(bytes, size, size); map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = map.minFilter = THREE.LinearFilter; map.needsUpdate = true; return map;
}

// Fixed pools bound draw calls and memory even during sustained squad combat.
// GPU resources are reused; all ages advance only with simulation time.
export class ImpactEffects {
  constructor(scene, random = Math.random) {
    this.random = random; this.root = new THREE.Group(); this.root.name = 'Surface impacts'; scene.add(this.root);
    this.dummy = new THREE.Object3D(); this.color = new THREE.Color(); this.cameraRotation = new THREE.Quaternion(); this.maps = []; this.materials = [];
    this.decalGeometry = new THREE.PlaneGeometry(1, 1); this.chipGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.decals = new Map(); this.particles = []; this.dust = [];
    for (const kind of ['concrete', 'wood', 'metal', 'sand']) {
      const map = texture(kind); this.maps.push(map);
      const material = new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: .95, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      this.materials.push(material);
      const mesh = new THREE.InstancedMesh(this.decalGeometry, material, 32); mesh.count = 0; mesh.frustumCulled = false; mesh.receiveShadow = true; this.root.add(mesh);
      this.decals.set(kind, { mesh, cursor: 0 });
    }
    for (const spark of [false, true]) {
      const material = spark ? new THREE.MeshBasicMaterial({ color: 0xffc46c, toneMapped: false }) : new THREE.MeshStandardMaterial({ roughness: .95 });
      this.materials.push(material);
      const mesh = new THREE.InstancedMesh(this.chipGeometry, material, 128); mesh.count = 0; mesh.frustumCulled = false; this.root.add(mesh);
      this[spark ? 'sparks' : 'chips'] = mesh;
    }
    const dustMap = texture('dust'); this.maps.push(dustMap);
    for (let i = 0; i < 24; i++) {
      const material = new THREE.MeshStandardMaterial({ map: dustMap, transparent: true, depthWrite: false, opacity: 0, roughness: 1, side: THREE.DoubleSide }); this.materials.push(material);
      const mesh = new THREE.Mesh(this.decalGeometry, material); mesh.visible = false; this.root.add(mesh); this.dust.push({ mesh, age: 2, life: 1 });
    }
    this.dustCursor = 0;
  }
  emit(hit) {
    if (!hit.normal || !hit.surface) return;
    const style = styles[hit.surface] || styles.concrete, n = new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z);
    const point = new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z).addScaledVector(n, hit.solidId === 'ground' ? .023 : .006);
    const facing = new THREE.Quaternion().setFromUnitVectors(normalAxis, n), pool = this.decals.get(hit.surface);
    const size = Math.min(style.size * (.8 + this.random() * .5), Math.max(0, hit.margin ?? Infinity) * (hit.surface === 'wood' ? .95 : 1.35));
    if (hit.decal && pool && size > .018) {
      this.dummy.position.copy(point); this.dummy.quaternion.copy(facing);
      this.dummy.rotateZ(this.random() * Math.PI * 2); this.dummy.scale.set(size, size * (hit.surface === 'wood' ? 1.4 : 1), 1); this.dummy.updateMatrix();
      pool.mesh.setMatrixAt(pool.cursor, this.dummy.matrix); pool.mesh.instanceMatrix.needsUpdate = true;
      pool.cursor = (pool.cursor + 1) % 32; pool.mesh.count = Math.min(32, pool.mesh.count + 1);
    }
    const spark = hit.surface === 'metal';
    for (let i = 0; i < (spark ? 9 : 7); i++) {
      const velocity = new THREE.Vector3((this.random() - .5) * 2.2, (this.random() - .5) * 2.2, .5 + this.random() * 2.3).applyQuaternion(facing);
      const scale = .009 + this.random() * .012;
      this.particles.push({ position: point.clone(), velocity, age: 0, life: spark ? .12 + this.random() * .18 : .4 + this.random() * .35,
        scale, spark, wood: hit.surface === 'wood', color: style.color, rotation: this.random() * 6 });
    }
    if (this.particles.length > 128) this.particles.splice(0, this.particles.length - 128);
    for (let i = 0; i < (spark ? 1 : 3); i++) {
      const p = this.dust[this.dustCursor++ % this.dust.length];
      p.mesh.position.copy(point); p.mesh.material.color.setHex(style.color); p.spin = this.random() * 6;
      p.velocity = n.clone().multiplyScalar(.12 + this.random() * .35).add(new THREE.Vector3((this.random() - .5) * .18, .12, 0));
      p.age = 0; p.life = .6 + this.random() * .55; p.size = .07 + this.random() * .07; p.opacity = style.dust;
      p.mesh.visible = true; p.mesh.scale.setScalar(p.size); p.mesh.material.opacity = p.opacity;
    }
    this.update(0);
  }
  update(dt, cameraRotation) {
    if (cameraRotation) this.cameraRotation.copy(cameraRotation);
    let chips = 0, sparks = 0;
    this.particles = this.particles.filter(p => p.age + dt < p.life);
    for (const p of this.particles) {
      p.age += dt; p.velocity.y -= dt * (p.spark ? 5 : 9.8); p.position.addScaledVector(p.velocity, dt);
      this.dummy.position.copy(p.position);
      if (p.spark) this.dummy.quaternion.setFromUnitVectors(up, p.velocity.clone().normalize());
      else this.dummy.rotation.set(p.rotation + p.age * 8, p.rotation, p.age * 5);
      const fade = 1 - p.age / p.life;
      this.dummy.scale.set(p.spark ? .003 * fade : p.scale, p.spark ? .06 * fade : p.scale * (p.wood ? 3 : .7), p.spark ? .003 : p.scale * .5);
      this.dummy.updateMatrix();
      const mesh = p.spark ? this.sparks : this.chips, index = p.spark ? sparks++ : chips++;
      mesh.setMatrixAt(index, this.dummy.matrix);
      if (!p.spark) mesh.setColorAt(index, this.color.setHex(p.color));
    }
    this.chips.count = chips; this.sparks.count = sparks;
    this.chips.instanceMatrix.needsUpdate = this.sparks.instanceMatrix.needsUpdate = true;
    if (this.chips.instanceColor) this.chips.instanceColor.needsUpdate = true;
    for (const p of this.dust) {
      p.age += dt;
      if (p.age >= p.life) { p.mesh.visible = false; continue; }
      p.mesh.quaternion.copy(this.cameraRotation); p.mesh.rotateZ(p.spin);
      p.mesh.position.addScaledVector(p.velocity, dt); p.mesh.scale.setScalar(p.size + p.age * .55);
      p.mesh.material.opacity = p.opacity * (1 - p.age / p.life) ** 2;
    }
  }
  reset() {
    this.particles.length = 0; this.chips.count = this.sparks.count = 0;
    for (const pool of this.decals.values()) { pool.cursor = 0; pool.mesh.count = 0; }
    for (const p of this.dust) { p.age = p.life; p.mesh.visible = false; }
    this.dustCursor = 0;
  }
  dispose() {
    this.root.removeFromParent(); this.root.traverse(o => { if (o.isInstancedMesh) o.dispose(); });
    this.maps.forEach(m => m.dispose()); this.materials.forEach(m => m.dispose()); this.decalGeometry.dispose(); this.chipGeometry.dispose();
  }
}
