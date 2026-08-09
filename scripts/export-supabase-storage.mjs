#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [objectsFile, outputDir] = process.argv.slice(2);

if (!objectsFile || !outputDir) {
  throw new Error('Usage: export-supabase-storage.mjs <objects.json> <output-dir>');
}

const objects = JSON.parse(await readFile(objectsFile, 'utf8'));
if (!Array.isArray(objects)) {
  throw new Error('Storage object manifest must be a JSON array');
}

await mkdir(outputDir, { recursive: true });

if (objects.length === 0) {
  await writeFile(
    path.join(outputDir, 'manifest.json'),
    JSON.stringify({ exportedAt: new Date().toISOString(), objects: [] }, null, 2),
  );
  console.log('Storage export: 0 objects');
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SECRET_KEY are required when Storage contains objects',
  );
}

const encodePath = (value) =>
  String(value)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const exported = [];

for (const object of objects) {
  const bucketId = String(object.bucket_id ?? '');
  const name = String(object.name ?? '');
  if (!bucketId || !name) {
    throw new Error('Storage object entry is missing bucket_id or name');
  }

  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/authenticated/${encodePath(bucketId)}/${encodePath(name)}`,
    {
      headers: {
        apikey: secretKey,
        authorization: `Bearer ${secretKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Storage download failed for ${bucketId}/${name}: HTTP ${response.status}`,
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const file = `${createHash('sha256').update(`${bucketId}\0${name}`).digest('hex')}.blob`;
  await writeFile(path.join(outputDir, file), bytes, { mode: 0o600 });
  exported.push({ bucketId, name, file, bytes: bytes.length, sha256 });
}

await writeFile(
  path.join(outputDir, 'manifest.json'),
  JSON.stringify({ exportedAt: new Date().toISOString(), objects: exported }, null, 2),
  { mode: 0o600 },
);

console.log(`Storage export: ${exported.length} objects`);
