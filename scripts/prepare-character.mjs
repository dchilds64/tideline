// Reproducible offline adaptation of the credited CC BY / CC0 source assets.
// Download the two files at the immutable URLs in public/models/manifest.json
// into artifacts/character-source before running this script. No Blender needed.
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationMixer, Quaternion, Vector3, Box3 } from 'three';

globalThis.ProgressEvent ??= class extends Event { constructor(type, properties = {}) { super(type); Object.assign(this, properties); } };
const directory = new URL('../artifacts/character-source/', import.meta.url);
const provenance = JSON.parse(await fs.readFile(new URL('../public/models/manifest.json', import.meta.url), 'utf8'));
const revision = provenance.revision;
const hash = data => createHash('sha256').update(data).digest('hex');
async function read(name) {
  const bytes = await fs.readFile(new URL(name, directory)), jsonLength = bytes.readUInt32LE(12);
  if (hash(bytes) !== provenance.sources.find(s => s.url.endsWith('/' + name))?.sha256) throw new Error(`Unverified source: ${name}`);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength)), binary = bytes.subarray(28 + jsonLength);
  const preview = structuredClone(json);
  preview.buffers[0].uri = `data:application/octet-stream;base64,${binary.toString('base64')}`;
  preview.materials = preview.materials.map(m => ({ name: m.name }));
  delete preview.images; delete preview.textures; delete preview.extensionsUsed; delete preview.extensionsRequired;
  const gltf = await new GLTFLoader().parseAsync(JSON.stringify(preview), '');
  gltf.scene.updateMatrixWorld(true);
  let skeleton; gltf.scene.traverse(o => { if (o.isSkinnedMesh && !skeleton) skeleton = o.skeleton; });
  return { bytes, json, binary, gltf, skeleton };
}
const source = await read('soldier.glb'), target = await read('soldier_tac.glb');
const canonical = name => name.replace('mixamorig', '').replace(/_\d+$/, '');
function bindRotation(inverse) { const matrix = inverse.clone().invert(); return new Quaternion().setFromRotationMatrix(matrix.clone().extractRotation(matrix)); }
const sourceBones = new Map(source.skeleton.bones.map((bone, i) => [canonical(bone.name), { bone, bind: bindRotation(source.skeleton.boneInverses[i]) }]));
const mapped = target.skeleton.bones.map((bone, i) => ({ bone, source: sourceBones.get(canonical(bone.name)), bind: bindRotation(target.skeleton.boneInverses[i]), node: target.gltf.parser.associations.get(bone).nodes })).filter(b => b.source);
const hips = mapped.find(b => canonical(b.bone.name) === 'Hips');
// The original headset is displaced above the skull. Omit that mesh, retaining
// the fitted cap and balaclava. Geometry/material bytes stay intact for provenance.
target.gltf.scene.traverse(o => { if (o.isMesh && o.material.name === 'HeadphonesT') o.visible = false; });
for (const node of target.json.nodes) if (node.mesh !== undefined && target.json.meshes[node.mesh].primitives.some(p => target.json.materials[p.material].name === 'HeadphonesT')) { delete node.mesh; delete node.skin; }
const mixer = new AnimationMixer(source.gltf.scene), desired = new Quaternion(), parent = new Quaternion(), position = new Vector3();
const clips = ['ready_idle', 'aim_idle', 'ready_walk', 'aim_walk', 'ready_run', 'ready_crouch_idle', 'ready_crouch_walk', 'aim_crouch_idle', 'aim_crouch_walk', 'reload', 'death'];
const blocks = [target.binary]; let byteLength = target.binary.length;
function accessor(values, type) {
  const data = Buffer.from(new Float32Array(values).buffer), count = values.length / (type === 'VEC4' ? 4 : type === 'VEC3' ? 3 : 1);
  const bufferView = target.json.bufferViews.length;
  target.json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: data.length }); blocks.push(data); byteLength += data.length;
  const index = target.json.accessors.length, item = { bufferView, componentType: 5126, count, type };
  if (type === 'SCALAR') { item.min = [Math.min(...values)]; item.max = [Math.max(...values)]; }
  target.json.accessors.push(item); return index;
}
target.json.animations = [];
for (const name of clips) {
  mixer.stopAllAction(); const clip = source.gltf.animations.find(c => c.name === name), action = mixer.clipAction(clip); action.play();
  const frames = Math.ceil(clip.duration * 30), times = [], rotations = mapped.map(() => []), translations = [];
  for (let frame = 0; frame <= frames; frame++) {
    const time = clip.duration * frame / frames; times.push(time);
    mixer.setTime(Math.min(time, clip.duration - .00001)); source.gltf.scene.updateMatrixWorld(true);
    for (const mapping of mapped) {
      desired.copy(mapping.source.bone.getWorldQuaternion(new Quaternion())).multiply(mapping.source.bind.clone().invert()).multiply(mapping.bind);
      mapping.bone.parent.getWorldQuaternion(parent).invert(); mapping.bone.quaternion.copy(parent).multiply(desired).normalize();
      if (mapping === hips) {
        mapping.source.bone.getWorldPosition(position).multiplyScalar(.88);
        mapping.bone.position.copy(mapping.bone.parent.worldToLocal(position));
      }
      mapping.bone.updateWorldMatrix(false, true);
    }
    target.gltf.scene.updateMatrixWorld(true);
    // Ground from actual deformed vertices, not the source skeleton's different
    // boot proportions. This is baked once, never performed per runtime frame.
    const bounds = new Box3();
    target.gltf.scene.traverse(o => { if (o.isMesh && o.visible) bounds.expandByObject(o, true); });
    hips.bone.getWorldPosition(position); position.y += .012 - bounds.min.y;
    hips.bone.position.copy(hips.bone.parent.worldToLocal(position)); target.gltf.scene.updateMatrixWorld(true);
    mapped.forEach((m, i) => rotations[i].push(...m.bone.quaternion.toArray())); translations.push(...hips.bone.position.toArray());
  }
  const input = accessor(times, 'SCALAR'), animation = { name, channels: [], samplers: [] };
  mapped.forEach((m, i) => {
    animation.channels.push({ sampler: animation.samplers.length, target: { node: m.node, path: 'rotation' } });
    animation.samplers.push({ input, output: accessor(rotations[i], 'VEC4'), interpolation: 'LINEAR' });
  });
  animation.channels.push({ sampler: animation.samplers.length, target: { node: hips.node, path: 'translation' } });
  animation.samplers.push({ input, output: accessor(translations, 'VEC3'), interpolation: 'LINEAR' });
  target.json.animations.push(animation); console.log(`Baked ${name}: ${frames + 1} poses / ${mapped.length} joints`);
}
target.json.buffers[0].byteLength = byteLength;
target.json.asset.extras.tideline = 'Retargeted CC0 Quaternius clips via credited BAMEN rig; floating headset omitted. See THIRD_PARTY_ASSETS.md.';
const raw = Buffer.from(JSON.stringify(target.json)), padded = Buffer.alloc(Math.ceil(raw.length / 4) * 4, 0x20); raw.copy(padded);
const binary = Buffer.concat(blocks), header = Buffer.alloc(20), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + padded.length + binary.length, 8); header.writeUInt32LE(padded.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
binHeader.writeUInt32LE(binary.length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
const output = Buffer.concat([header, padded, binHeader, binary]);
await fs.writeFile(new URL('../public/models/operator.glb', import.meta.url), output);
await fs.writeFile(new URL('../public/models/manifest.json', import.meta.url), JSON.stringify({ file: 'public/models/operator.glb', sha256: hash(output), bytes: output.length, revision, license: 'CC-BY-4.0', authors: ['DanlyVostok', 'BAMEN', 'Quaternius', 'cktang88 (source conversion)'], sources: ['soldier_tac.glb', 'soldier.glb'].map((name, i) => ({ url: `https://raw.githubusercontent.com/cktang88/3d-fps/${revision}/public/assets/models/characters/${name}`, sha256: hash(i ? source.bytes : target.bytes) })), clips }, null, 2) + '\n');
console.log(`Wrote operator.glb: ${(output.length / 1024 / 1024).toFixed(2)} MiB`);
