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
