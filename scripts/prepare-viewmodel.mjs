// Rebuild the credited CC BY assets as self-contained local GLBs. No Blender,
// network access or third-party animation code is needed at runtime.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const source = new URL('../artifacts/fp-source/', import.meta.url);
const output = new URL('../public/models/', import.meta.url);
const revision = '130ac2a5c856401ec36e7d35afcfefe40c5801f4';
const expected = {
  'm4a1.glb': 'f66a03a316e8ac6a1505b21c3c7cf8ad4672fccaf1ce947a9ea5ed33600364fc',
  'arms_normal.webp': '0500bdd5e6045621d980105cc281312dd6d7fc66a6649ddbe632fea802dba881',
  'arms_basecolor.webp': '4657bc61099b7cf92084c5481c0c6d19a1d8219c8ee8c08e546f9f823fec6946',
  'optics.glb': '67ea0a365d519c32ed00543f81240696bdf7675de4fb4ab43cd7fa1f9933a82f',
  'animated_reload_arms.glb': '062c8288a79ec91d033fafd4be23f6545b337e2cf642dda0cbcc6854b270cd1b',
  'smg45_rifle_arms.glb': '6ec3a961424096cc55df26ec5821bcc0827654e5e5d9e0f1e18d765e22311958',
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
// Copy the selected scene's complete dependency graph, dropping unused geometry,
// textures, skins and animation. In particular, the rejected fitted hands must
// not be retained inside the rifle GLB as an accidental runtime dependency.
function select(data, rootName, excludedNames = []) {
  const j = data.json, result = { asset: { ...j.asset }, scene: 0, scenes: [{ nodes: [] }], extensionsUsed: j.extensionsUsed, extensionsRequired: j.extensionsRequired };
  const maps = new Map(), selectedViews = [], excluded = new Set(excludedNames);
  function copy(kind, index) {
    const key = `${kind}:${index}`; if (maps.has(key)) return maps.get(key);
    result[kind] ||= []; const dest = result[kind].length, item = structuredClone(j[kind][index]);
    result[kind].push(item); maps.set(key, dest);
    if (kind === 'nodes') {
      if (item.children) item.children = item.children.filter(i => !excluded.has(j.nodes[i].name)).map(i => copy('nodes', i));
      if (item.mesh !== undefined) item.mesh = copy('meshes', item.mesh);
      if (item.skin !== undefined) item.skin = copy('skins', item.skin);
    }
    if (kind === 'skins') {
      item.joints = item.joints.map(i => copy('nodes', i));
      if (item.skeleton !== undefined) item.skeleton = copy('nodes', item.skeleton);
      item.inverseBindMatrices = copy('accessors', item.inverseBindMatrices);
    }
    if (kind === 'meshes') for (const p of item.primitives) {
      if (p.indices !== undefined) p.indices = copy('accessors', p.indices);
      if (p.material !== undefined) p.material = copy('materials', p.material);
      for (const key of Object.keys(p.attributes)) p.attributes[key] = copy('accessors', p.attributes[key]);
    }
    if (kind === 'accessors' || kind === 'images') {
      if (item.bufferView !== undefined) item.bufferView = copy('bufferViews', item.bufferView);
      if (item.sparse) for (const key of ['indices', 'values']) item.sparse[key].bufferView = copy('bufferViews', item.sparse[key].bufferView);
    }
    if (kind === 'bufferViews') selectedViews[dest] = data.views[index];
    if (kind === 'textures') {
      if (item.source !== undefined) item.source = copy('images', item.source);
      if (item.sampler !== undefined) item.sampler = copy('samplers', item.sampler);
      if (item.extensions?.EXT_texture_webp) item.extensions.EXT_texture_webp.source = copy('images', item.extensions.EXT_texture_webp.source);
    }
    if (kind === 'materials') for (const owner of [item, item.pbrMetallicRoughness || {}]) for (const [key, value] of Object.entries(owner)) {
      if (key.endsWith('Texture')) value.index = copy('textures', value.index);
    }
    return dest;
  }
  const index = j.nodes.findIndex(n => n.name === rootName);
  if (index < 0) throw new Error(`Missing source root: ${rootName}`);
  result.scenes[0].nodes.push(copy('nodes', index));
  return { json: result, views: selectedViews };
}
await save('first-person.glb', select(await unpack('m4a1.glb', 'fp'), 'Gun_m4a1'), ['Firewarden3D', 'cktang88 (conversion)'], 'Rifle only; removed fitted arm mesh, rig, animations and their unused textures. Decoded geometry.');
await save('hands.glb', select(await unpack('animated_reload_arms.glb', 'weapons'), 'WeaponRoot', ['FullReloadArmsAuditMesh', 'SidearmReloadForearmsMesh']), ['DJMaesen', 'AetherRadar / Operation Steel Tide (adaptation)', 'cktang88 (conversion)'], 'Native runtime support forearm and finger rig; removed non-runtime full-arm audit mesh, duplicate sidearm mesh and animations. No vertex warping.');
await save('trigger-hand.glb', select(await unpack('smg45_rifle_arms.glb', 'weapons'), 'RightArm'), ['DJMaesen', 'AetherRadar / Operation Steel Tide (adaptation)', 'cktang88 (conversion)'], 'Original fixed rifle trigger-hand and sleeve pose; extracted right arm only. No vertex warping.');
await save('reflex-sight.glb', select(await unpack('optics.glb', 'weapons'), 'MicroOptic'), ['valterjherson1', 'cktang88 (conversion)'], 'Extracted micro red-dot sight only; decoded geometry. Source conversion removed branding.');
await writeFile(new URL('viewmodel-manifest.json', output), JSON.stringify({ revision, sources, assets: entries }, null, 2) + '\n');
console.log(entries.map(e => `${e.file}: ${(e.bytes / 1048576).toFixed(2)} MiB`).join('\n'));
