import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SOLIDS } from './world.js';

export function randomSequence(seed = 73) {
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// Assets are bundled with the game. Only color maps use an sRGB transfer function.
export class SurfaceLibrary {
  constructor(renderer) {
    this.failed = []; this.textures = new Map();
    const manager = new THREE.LoadingManager();
    this.ready = new Promise(resolve => { manager.onLoad = () => resolve(this.failed); });
    this.loader = new THREE.TextureLoader(manager);
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
  texture(name, kind) {
    const key = `${name}/${kind}`;
    if (this.textures.has(key)) return this.textures.get(key);
    const texture = this.loader.load(`/textures/${key}.jpg`, undefined, undefined, () => {
      this.failed.push(key);
      const fallback = document.createElement('canvas'); fallback.width = fallback.height = 2;
      const ctx = fallback.getContext('2d'); ctx.fillStyle = kind === 'nor_gl' ? '#8080ff' : '#bcbcbc'; ctx.fillRect(0, 0, 2, 2);
      texture.image = fallback; texture.needsUpdate = true;
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = this.anisotropy;
    if (kind === 'diffuse') texture.colorSpace = THREE.SRGBColorSpace;
    this.textures.set(key, texture); return texture;
  }
  material(name, tileMeters, color = 0xffffff, normal = .7) {
    const material = new THREE.MeshStandardMaterial({
      color, map: this.texture(name, 'diffuse'), normalMap: this.texture(name, 'nor_gl'),
      roughnessMap: this.texture(name, 'rough'), roughness: 1, normalScale: new THREE.Vector2(normal, normal),
    });
    material.userData.tileMeters = tileMeters;
    return material;
  }
  fabric(color) {
    const normalMap = this.texture('denim_fabric', 'nor_gl'), roughnessMap = this.texture('denim_fabric', 'rough');
    normalMap.repeat.set(4, 4); roughnessMap.repeat.set(4, 4);
    return new THREE.MeshStandardMaterial({ color, normalMap, roughnessMap, roughness: 1, normalScale: new THREE.Vector2(.3, .3) });
  }
}

// Preserve physical texture scale across long walls, small props and the ground.
export function scaleBoxUV(geometry, w, h, d, meters) {
  const uv = geometry.attributes.uv, normal = geometry.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i));
    uv.setXY(i, uv.getX(i) * (nx > .5 ? d : w) / meters, uv.getY(i) * (ny > .5 ? d : h) / meters);
  }
  return geometry;
}

export function boulderGeometry(w, h, d, seed) {
  const geometry = new THREE.SphereGeometry(1, 28, 18);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ripple = Math.sin(x * 4.7 + seed) * Math.cos(z * 3.1 - seed) * .065 + Math.sin(y * 7 + z * 3) * .035;
    const shape = value => Math.sign(value) * Math.pow(Math.abs(value), .52);
    pos.setXYZ(i, shape(x) * w * .59 * (1 + ripple), shape(y) * h * .55 * (1 + ripple), shape(z) * d * .59 * (1 + ripple));
  }
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) * 1.5, uv.getY(i) * h);
  geometry.computeVertexNormals();
  return geometry;
}

export function skyTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d'), data = ctx.createImageData(c.width, c.height), rng = randomSequence(102);
  const grid = Array.from({ length: 128 * 64 }, rng);
  const noise = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y), sx = x - ix, sy = y - iy;
    const u = sx * sx * (3 - 2 * sx), v = sy * sy * (3 - 2 * sy);
    const at = (xx, yy) => grid[((yy % 64 + 64) % 64) * 128 + (xx % 128 + 128) % 128];
    return THREE.MathUtils.lerp(THREE.MathUtils.lerp(at(ix, iy), at(ix + 1, iy), u), THREE.MathUtils.lerp(at(ix, iy + 1), at(ix + 1, iy + 1), u), v);
  };
  for (let y = 0; y < 512; y++) for (let x = 0; x < 1024; x++) {
    const elevation = Math.max(0, 1 - y / 256), cloud = noise(x / 64, y / 38) * .57 + noise(x / 16, y / 12) * .28 + noise(x / 4, y / 4) * .15;
    const haze = (1 - elevation) * 12, density = Math.max(0, cloud - .36) * 36;
    const i = (y * 1024 + x) * 4;
    data.data[i] = 8 + haze + density; data.data[i + 1] = 14 + haze + density; data.data[i + 2] = 23 + haze + density * 1.1; data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace; texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

// Deterministic, clustered beach grass: narrow bent blades instead of solid cones.
export function coastalGrass(scene) {
  const rng = randomSequence(49), vertices = [], colors = [];
  for (let i = 0; i < 2300; i++) {
    const x = (rng() - .5) * 78, z = rng() * 65 - 30;
    if ((Math.abs(x) < 19.4 && z < 18 && z > -18) || (Math.abs(x) < 4 && z > 15) || (x > 22 && z > 25)) continue;
    if (SOLIDS.some(b => Math.abs(x - b.x) < b.w / 2 + .4 && Math.abs(z - b.z) < b.d / 2 + .4)) continue;
    const density = Math.sin(x * .37) * Math.cos(z * .31); if (density < -.15 || rng() > .68) continue;
    for (let blade = 0; blade < 8; blade++) {
      const angle = rng() * Math.PI * 2, width = .016 + rng() * .018, height = .17 + rng() * .47;
      const bx = x + (rng() - .5) * .35, bz = z + (rng() - .5) * .35, dx = Math.cos(angle) * width, dz = Math.sin(angle) * width;
      const bend = .08 + rng() * .15, tx = bx + Math.sin(angle) * bend, tz = bz + Math.cos(angle) * bend;
      const a = [bx - dx, -.035, bz - dz], b = [bx + dx, -.035, bz + dz], c = [tx - dx * .45, height * .6, tz - dz * .45], d = [tx + dx * .45, height * .6, tz + dz * .45], tip = [tx + bend * .5, height, tz];
      vertices.push(...a, ...b, ...c, ...b, ...d, ...c, ...c, ...d, ...tip);
      const tone = .65 + rng() * .35;
      for (let n = 0; n < 9; n++) { const top = vertices[vertices.length - 27 + n * 3 + 1] / height; colors.push((.19 + top * .11) * tone, (.23 + top * .1) * tone, (.13 + top * .08) * tone); }
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals();
  const time = { value: 0 }, material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.uniforms.windTime = time;
    shader.vertexShader = 'uniform float windTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += sin(windTime * 1.7 + position.x * .8 + position.z * .5) * max(position.y, 0.0) * .13;');
  };
  const grass = new THREE.Mesh(geo, material); grass.receiveShadow = true; scene.add(grass);
  return time;
}

// Reduce draw calls for static dressing; dynamic actors, sea and transparent effects stay separate.
export function batchStaticWorld(scene) {
  const batches = new Map();
  for (const mesh of [...scene.children]) {
    if (!mesh.isMesh || mesh.userData.dynamic || Array.isArray(mesh.material) || mesh.material.transparent) continue;
    const key = `${mesh.material.uuid}/${mesh.castShadow}/${mesh.receiveShadow}/${mesh.layers.mask}`;
    if (!batches.has(key)) batches.set(key, []); batches.get(key).push(mesh);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => {
      mesh.updateMatrix(); const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
      return geo.applyMatrix4(mesh.matrix);
    });
    const merged = mergeGeometries(geometries); geometries.forEach(g => g.dispose());
    if (!merged) continue;
    const first = meshes[0], batch = new THREE.Mesh(merged, first.material);
    batch.castShadow = first.castShadow; batch.receiveShadow = first.receiveShadow; batch.layers.mask = first.layers.mask;
    scene.add(batch); meshes.forEach(mesh => scene.remove(mesh));
    new Set(meshes.map(mesh => mesh.geometry)).forEach(geometry => geometry.dispose());
  }
}
