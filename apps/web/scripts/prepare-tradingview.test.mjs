import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { hashAssetTree, verifyAssetTree } from './tradingview-assets.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'orba-tradingview-test-'));
  await mkdir(join(root, 'bundles'));
  await Promise.all([
    writeFile(join(root, 'charting_library.standalone.js'), 'library'),
    writeFile(join(root, 'charting_library.d.ts'), 'types'),
    writeFile(join(root, 'datafeed-api.d.ts'), 'datafeed'),
    writeFile(join(root, 'package.json'), '{}'),
    writeFile(join(root, 'bundles', 'runtime.js'), 'runtime'),
  ]);
  return root;
}

test('hashAssetTree is stable for an unchanged asset tree', async () => {
  const root = await fixture();
  try {
    assert.deepEqual(await hashAssetTree(root), await hashAssetTree(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('hashAssetTree is stable across platform line endings', async () => {
  const root = await fixture();
  try {
    await writeFile(join(root, 'bundles', 'runtime.js'), 'first\nsecond\n');
    const lf = await hashAssetTree(root);
    await writeFile(join(root, 'bundles', 'runtime.js'), 'first\r\nsecond\r\n');
    assert.deepEqual(await hashAssetTree(root), lf);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifyAssetTree accepts the locked tree and rejects tampering', async () => {
  const root = await fixture();
  try {
    const locked = await hashAssetTree(root);
    const lock = { assetTreeSha256: locked.digest };
    assert.equal((await verifyAssetTree(root, lock)).fileCount, locked.fileCount);

    await writeFile(join(root, 'bundles', 'runtime.js'), 'tampered');
    await assert.rejects(() => verifyAssetTree(root, lock), /digest mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('verifyAssetTree rejects an incomplete library', async () => {
  const root = await fixture();
  try {
    await rm(join(root, 'datafeed-api.d.ts'));
    await assert.rejects(
      () => verifyAssetTree(root, { assetTreeSha256: '0'.repeat(64) }),
      /missing datafeed-api\.d\.ts/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
