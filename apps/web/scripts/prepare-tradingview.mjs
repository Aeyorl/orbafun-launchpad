import { cp, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const destination = resolve('public/vendor/tradingview/charting_library');
const localRepository = process.env.TRADINGVIEW_LIBRARY_PATH?.trim();
const githubToken = process.env.TRADINGVIEW_GITHUB_TOKEN?.trim();

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

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  await cp(source, destination, { recursive: true });
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
  const clonePath = join(temporaryRoot, 'charting_library');
  const authorization = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
  const gitEnvironment = {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `Authorization: Basic ${authorization}`,
    GIT_TERMINAL_PROMPT: '0',
  };

  try {
    await runGit(
      [
        'clone',
        '--depth=1',
        '--filter=blob:none',
        'https://github.com/tradingview/charting_library.git',
        clonePath,
      ],
      gitEnvironment,
    );
    await copyLibrary(clonePath);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (localRepository) {
  await copyLibrary(resolve(localRepository));
  console.log('TradingView Advanced Charts assets copied from the local licensed repository.');
} else if (githubToken) {
  await cloneWithToken();
  console.log('TradingView Advanced Charts assets fetched from the private licensed repository.');
} else if (await isDirectory(destination)) {
  console.log('Using existing local TradingView Advanced Charts assets.');
} else if (process.env.VERCEL) {
  throw new Error(
    'TRADINGVIEW_GITHUB_TOKEN is required for Vercel builds. Configure a read-only token as a Sensitive Environment Variable.',
  );
} else {
  console.warn(
    'TradingView Advanced Charts assets are unavailable; the app will use its Lightweight Charts fallback.',
  );
}
