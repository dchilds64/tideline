// Rebuild the credited CC BY assets as self-contained local GLBs. No Blender,
// network access or third-party animation code is needed at runtime.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Vector3 } from 'three';

const source = new URL('../artifacts/fp-source/', import.meta.url);
const output = new URL('../public/models/', import.meta.url);
const revision = '130ac2a5c856401ec36e7d35afcfefe40c5801f4';
const expected = {
  'm4a1.glb': 'f66a03a316e8ac6a1505b21c3c7cf8ad4672fccaf1ce947a9ea5ed33600364fc',
  'arms_normal.webp': '0500bdd5e6045621d980105cc281312dd6d7fc66a6649ddbe632fea802dba881',
  'arms_basecolor.webp': '4657bc61099b7cf92084c5481c0c6d19a1d8219c8ee8c08e546f9f823fec6946',
  'optics.glb': '67ea0a365d519c32ed00543f81240696bdf7675de4fb4ab43cd7fa1f9933a82f',
};
const hash = b => createHash('sha256').update(b).digest('hex');
const sources = [];
async function input(name, folder = 'fp') {
  const bytes = await readFile(new URL(name, source));
  if (hash(bytes) !== expected[name]) throw new Error(`Source checksum mismatch: ${name}`);
  sources.push({ url: `https://raw.githubusercontent.com/cktang88/3d-fps/${revision}/public/assets/models/${folder}/${name}`, sha256: hash(bytes) });
  return bytes;
}
async function unpack(name, folder) {
  const b = await input(name, folder), n = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + n)), bin = b.subarray(28 + n), views = [];
  await MeshoptDecoder.ready;
  for (const view of json.bufferViews) {
    const c = view.extensions?.EXT_meshopt_compression;
    if (c) {
      const decoded = new Uint8Array(c.count * c.byteStride);
      MeshoptDecoder.decodeGltfBuffer(decoded, c.count, c.byteStride, bin.subarray(c.byteOffset, c.byteOffset + c.byteLength), c.mode, c.filter);
      views.push(Buffer.from(decoded)); delete view.extensions;
    } else views.push(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
  }
  for (const image of json.images) if (image.uri) {
    const bytes = await input(image.uri); image.bufferView = views.length;
    views.push(bytes); json.bufferViews.push({ byteLength: bytes.length }); delete image.uri;
  }
  json.extensionsUsed = json.extensionsUsed.filter(e => e !== 'EXT_meshopt_compression');
  json.extensionsRequired = json.extensionsRequired.filter(e => e !== 'EXT_meshopt_compression');
  return { json, views };
}
function pack(json, views) {
  let offset = 0; const chunks = [];
  json.bufferViews.forEach((view, i) => {
    const data = views[i], padding = Buffer.alloc((4 - data.length % 4) % 4);
    Object.assign(view, { buffer: 0, byteOffset: offset, byteLength: data.length });
    chunks.push(data, padding); offset += data.length + padding.length;
  });
  json.buffers = [{ byteLength: offset }];
  const text = Buffer.from(JSON.stringify(json)), padded = Buffer.concat([text, Buffer.alloc((4 - text.length % 4) % 4, 32)]);
  const header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + offset, 8);
  header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  binHeader.writeUInt32LE(offset); binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, binHeader, ...chunks]);
}
const entries = [];
async function save(name, data, authors, description) {
  data.json.asset.extras = { license: 'CC-BY-4.0', authors, source: revision, modifications: description };
  const bytes = pack(data.json, data.views); await writeFile(new URL(name, output), bytes);
  entries.push({ file: `public/models/${name}`, bytes: bytes.length, sha256: hash(bytes), license: 'CC-BY-4.0', authors, description });
}
const rifle = await unpack('m4a1.glb', 'fp');
delete rifle.json.animations; // Use its authored grip pose and our own reload choreography.
// Extend the cropped upper sleeves along their bind-space bone axes. The source
// ends before the shoulder; without this tailoring the cut ends enter the image
// during a raised reload or in a taller viewport. Wrists and fingers are intact.
globalThis.ProgressEvent ??= class extends Event { constructor(type, fields = {}) { super(type); Object.assign(this, fields); } };
const packed = pack(rifle.json, rifle.views), jsonLength = packed.readUInt32LE(12);
const preview = structuredClone(rifle.json);
preview.buffers[0].uri = `data:application/octet-stream;base64,${packed.subarray(28 + jsonLength).toString('base64')}`;
preview.materials = preview.materials.map(m => ({ name: m.name })); delete preview.images; delete preview.textures;
const loaded = await new GLTFLoader().parseAsync(JSON.stringify(preview), '');
const arms = loaded.scene.getObjectByName('FPArms'), attributes = arms.geometry.attributes;
const positions = new Float32Array(attributes.position.count * 3), minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
const sleeves = ['L', 'R'].map(side => {
  const index = arms.skeleton.bones.findIndex(b => b.name === `UpArm_${side}`), inverse = arms.skeleton.boneInverses[index];
  return { index, toBone: inverse.clone().multiply(arms.bindMatrix), fromBone: arms.bindMatrixInverse.clone().multiply(inverse.clone().invert()) };
});
for (let i = 0; i < attributes.position.count; i++) {
  const point = new Vector3().fromBufferAttribute(attributes.position, i);
  for (const sleeve of sleeves) {
    let weight = 0;
    for (let c = 0; c < 4; c++) if (attributes.skinIndex.getComponent(i, c) === sleeve.index) weight += attributes.skinWeight.getComponent(i, c);
    if (!weight) continue;
    point.applyMatrix4(sleeve.toBone);
    point.y -= .40 * weight * Math.max(0, Math.min(1, (.23 - point.y) / .16));
    point.applyMatrix4(sleeve.fromBone);
  }
  point.toArray(positions, i * 3);
  point.toArray().forEach((n, axis) => { minimum[axis] = Math.min(minimum[axis], n); maximum[axis] = Math.max(maximum[axis], n); });
}
const positionAccessor = rifle.json.accessors[rifle.json.meshes[0].primitives[0].attributes.POSITION];
Object.assign(positionAccessor, { bufferView: rifle.views.length, byteOffset: 0, componentType: 5126, normalized: false, min: minimum, max: maximum });
const positionBytes = Buffer.from(positions.buffer); rifle.views.push(positionBytes); rifle.json.bufferViews.push({ byteLength: positionBytes.length, target: 34962 });
await save('first-person.glb', rifle, ['DJMaesen', 'Cransh', 'Firewarden3D', 'cktang88 (conversion, rig fitting)'], 'Embedded arm textures; decoded geometry; extended cropped upper sleeves; removed unused vertical-grip clip. Original grip pose retained.');

// Extract only the micro red-dot sight; no other creators’ optic assets ship.
const optic = await unpack('optics.glb', 'weapons'), j = optic.json;
const result = { asset: j.asset, scene: 0, scenes: [{ nodes: [4] }], nodes: j.nodes.slice(5, 10), meshes: [j.meshes[1]], extensionsUsed: j.extensionsUsed, extensionsRequired: j.extensionsRequired };
result.nodes.forEach(n => { if (n.children) n.children = n.children.map(i => i - 5); if (n.mesh !== undefined) n.mesh = 0; });
const maps = new Map();
function copy(kind, index) {
  const key = `${kind}:${index}`; if (maps.has(key)) return maps.get(key);
  result[kind] ||= []; const dest = result[kind].length, item = structuredClone(j[kind][index]);
  result[kind].push(item); maps.set(key, dest);
  if (kind === 'accessors' || kind === 'images') { if (item.bufferView !== undefined) item.bufferView = copy('bufferViews', item.bufferView); }
  if (kind === 'textures') {
    if (item.source !== undefined) item.source = copy('images', item.source);
    if (item.sampler !== undefined) item.sampler = copy('samplers', item.sampler);
    if (item.extensions?.EXT_texture_webp) item.extensions.EXT_texture_webp.source = copy('images', item.extensions.EXT_texture_webp.source);
  }
  if (kind === 'materials') {
    for (const owner of [item, item.pbrMetallicRoughness || {}]) for (const [key, value] of Object.entries(owner)) {
      if (key.endsWith('Texture')) value.index = copy('textures', value.index);
    }
  }
  return dest;
}
for (const p of result.meshes[0].primitives) {
  p.indices = copy('accessors', p.indices); p.material = copy('materials', p.material);
  for (const key of Object.keys(p.attributes)) p.attributes[key] = copy('accessors', p.attributes[key]);
}
const selectedViews = [];
for (const [key, index] of maps) if (key.startsWith('bufferViews:')) selectedViews[index] = optic.views[Number(key.split(':')[1])];
await save('reflex-sight.glb', { json: result, views: selectedViews }, ['valterjherson1', 'cktang88 (conversion)'], 'Extracted micro red-dot sight only; decoded geometry. Source conversion removed branding.');
await writeFile(new URL('viewmodel-manifest.json', output), JSON.stringify({ revision, sources, assets: entries }, null, 2) + '\n');
console.log(entries.map(e => `${e.file}: ${(e.bytes / 1048576).toFixed(2)} MiB`).join('\n'));
