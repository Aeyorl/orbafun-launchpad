import { cp, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { loadAssetLock, verifyAssetTree } from './tradingview-assets.mjs';

const destination = resolve('public/vendor/tradingview/charting_library');
const lockPath = resolve('tradingview-assets.lock.json');
const lock = await loadAssetLock(lockPath);
const localRepository = process.env.TRADINGVIEW_LIBRARY_PATH?.trim();
const githubToken = process.env.TRADINGVIEW_GITHUB_TOKEN?.trim();
const configuredRef = process.env.TRADINGVIEW_LIBRARY_REF?.trim();
const requireAssets = Boolean(process.env.VERCEL) || process.env.TRADINGVIEW_REQUIRED === 'true';

if (configuredRef && configuredRef !== lock.ref) {
  throw new Error(
    `TRADINGVIEW_LIBRARY_REF must match the locked commit ${lock.ref}.`,
  );
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function copyLibrary(repositoryPath) {
  const source = join(repositoryPath, 'charting_library');
  if (!(await isDirectory(source))) {
    throw new Error(`TradingView charting_library directory not found at ${source}`);
  }

  await verifyAssetTree(source, lock);

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });
  await verifyAssetTree(destination, lock);
}

function runGit(args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('git', args, { env, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`git exited with code ${code}`));
    });
  });
}

async function cloneWithToken() {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'orba-tradingview-'));
  const clonePath = join(temporaryRoot, 'repository');
  const authorization = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
  const gitEnvironment = {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${authorization}`,
    GIT_TERMINAL_PROMPT: '0',
  };

  try {
    await mkdir(clonePath);
    await runGit(['-C', clonePath, 'init'], gitEnvironment);
    await runGit(['-C', clonePath, 'remote', 'add', 'origin', lock.repository], gitEnvironment);
    await runGit(['-C', clonePath, 'fetch', '--depth=1', 'origin', lock.ref], gitEnvironment);
    await runGit(
      ['-C', clonePath, '-c', 'advice.detachedHead=false', 'checkout', '--detach', 'FETCH_HEAD'],
      gitEnvironment,
    );
    await copyLibrary(clonePath);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (localRepository) {
  await copyLibrary(resolve(localRepository));
  console.log(`TradingView Advanced Charts assets verified at ${lock.ref} from the local repository.`);
} else if (githubToken) {
  await cloneWithToken();
  console.log(`TradingView Advanced Charts assets fetched and verified at ${lock.ref}.`);
} else if (await isDirectory(destination)) {
  await verifyAssetTree(destination, lock);
  console.log(`Using verified local TradingView Advanced Charts assets at ${lock.ref}.`);
} else if (requireAssets) {
  throw new Error(
    'Verified TradingView Advanced Charts assets are required. Configure TRADINGVIEW_LIBRARY_PATH or a read-only TRADINGVIEW_GITHUB_TOKEN.',
  );
} else {
  console.info(
    'TradingView Advanced Charts assets were not prepared; using the Lightweight Charts fallback. Set TRADINGVIEW_LIBRARY_PATH to a licensed checkout to enable Advanced Charts locally.',
  );
}
