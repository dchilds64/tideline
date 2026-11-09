import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(path.join(root, 'public/textures/manifest.json'), 'utf8'));
const seen = new Set(); let bytes = 0;
for (const entry of manifest) {
  const filename = path.resolve(root, entry.file);
  if (!filename.startsWith(path.join(root, 'public', 'textures') + path.sep)) throw new Error(`Asset outside texture directory: ${entry.file}`);
  if (seen.has(filename)) throw new Error(`Duplicate asset: ${entry.file}`);
  seen.add(filename);
  const buffer = await readFile(filename);
  if (createHash('md5').update(buffer).digest('hex') !== entry.md5) throw new Error(`Asset checksum mismatch: ${entry.file}`);
  if (entry.license !== 'CC0-1.0' || !entry.source.startsWith('https://dl.polyhaven.org/')) throw new Error(`Missing asset provenance: ${entry.file}`);
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error(`Invalid JPEG: ${entry.file}`);
  bytes += (await stat(filename)).size;
}
if (!seen.size) throw new Error('No bundled assets');
console.log(`${seen.size} local JPEG maps verified against source checksums; ${(bytes / 1024 / 1024).toFixed(2)} MiB total.`);

const model = JSON.parse(await readFile(path.join(root, 'public/models/manifest.json'), 'utf8'));
const modelPath = path.resolve(root, model.file);
if (!modelPath.startsWith(path.join(root, 'public', 'models') + path.sep)) throw new Error('Model outside model directory');
const glb = await readFile(modelPath);
if (createHash('sha256').update(glb).digest('hex') !== model.sha256 || glb.length !== model.bytes) throw new Error('Operator checksum mismatch');
if (glb.readUInt32LE(0) !== 0x46546c67 || glb.readUInt32LE(4) !== 2 || glb.readUInt32LE(8) !== glb.length) throw new Error('Invalid operator GLB');
const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)));
if (json.buffers.some(b => b.uri) || json.images.some(i => i.uri)) throw new Error('Operator must be self-contained');
if (model.license !== 'CC-BY-4.0' || !json.asset.extras.source || !model.authors.length) throw new Error('Missing character provenance');
for (const name of model.clips) if (!json.animations.some(a => a.name === name)) throw new Error(`Missing character clip: ${name}`);
console.log(`Operator GLB verified: ${(glb.length / 1024 / 1024).toFixed(2)} MiB, ${json.animations.length} clips, embedded textures and skeleton.`);

const firstPerson = JSON.parse(await readFile(path.join(root, 'public/models/viewmodel-manifest.json'), 'utf8'));
for (const entry of firstPerson.assets) {
  const filename = path.resolve(root, entry.file);
  if (!filename.startsWith(path.join(root, 'public', 'models') + path.sep)) throw new Error('First-person model outside model directory');
  const bytes = await readFile(filename);
  if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error(`First-person checksum mismatch: ${entry.file}`);
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error(`Invalid GLB: ${entry.file}`);
  const asset = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
  if (asset.buffers.some(b => b.uri) || asset.images.some(i => i.uri)) throw new Error(`External asset dependency: ${entry.file}`);
  if (entry.license !== 'CC-BY-4.0' || !entry.authors.length || !asset.asset.extras.source) throw new Error('Missing first-person provenance');
  console.log(`${entry.file} verified: ${(bytes.length / 1048576).toFixed(2)} MiB, embedded maps and geometry.`);
}
