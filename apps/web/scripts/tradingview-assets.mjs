import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';

export const REQUIRED_TRADINGVIEW_FILES = [
  'charting_library.standalone.js',
  'charting_library.d.ts',
  'datafeed-api.d.ts',
  'package.json',
];

function normalizeRelativePath(path) {
  return path.split(sep).join('/');
}

function normalizeContents(contents) {
  return Buffer.from(contents.toString('binary').replaceAll('\r\n', '\n'), 'binary');
}

async function listFiles(root, directory = root) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`TradingView asset tree must not contain symbolic links: ${absolutePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listFiles(root, absolutePath)));
    } else if (entry.isFile()) {
      files.push({
        absolutePath,
        relativePath: normalizeRelativePath(relative(root, absolutePath)),
      });
    }
  }

  return files;
}

export async function hashAssetTree(rootPath) {
  const root = resolve(rootPath);
  const files = (await listFiles(root)).sort((a, b) =>
    a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
  );
  const aggregate = createHash('sha256');

  for (const file of files) {
    const contents = normalizeContents(await readFile(file.absolutePath));
    const digest = createHash('sha256').update(contents).digest('hex');
    aggregate.update(`${file.relativePath}\0${contents.byteLength}\0${digest}\n`);
  }

  return {
    digest: aggregate.digest('hex'),
    fileCount: files.length,
  };
}

export async function loadAssetLock(lockPath) {
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  if (lock.version !== 1) throw new Error('Unsupported TradingView asset lock version.');
  if (!/^https:\/\/github\.com\/tradingview\/charting_library\.git$/.test(lock.repository)) {
    throw new Error('TradingView asset lock contains an unexpected repository.');
  }
  if (!/^[0-9a-f]{40}$/.test(lock.ref)) {
    throw new Error('TradingView asset lock ref must be a 40-character commit SHA.');
  }
  if (!/^[0-9a-f]{64}$/.test(lock.assetTreeSha256)) {
    throw new Error('TradingView asset lock digest must be a SHA-256 value.');
  }
  return lock;
}

export async function verifyAssetTree(rootPath, lock) {
  const root = resolve(rootPath);
  for (const requiredFile of REQUIRED_TRADINGVIEW_FILES) {
    const file = join(root, requiredFile);
    try {
      if (!(await stat(file)).isFile()) throw new Error();
    } catch {
      throw new Error(`TradingView asset tree is missing ${requiredFile}.`);
    }
  }

  const actual = await hashAssetTree(root);
  if (actual.digest !== lock.assetTreeSha256) {
    throw new Error(
      `TradingView asset digest mismatch: expected ${lock.assetTreeSha256}, received ${actual.digest}.`,
    );
  }
  return actual;
}
