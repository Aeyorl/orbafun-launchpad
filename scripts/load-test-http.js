/**
 * Dependency-free HTTP capacity smoke test.
 * Runs N virtual users, each executing a realistic browse sequence.
 *
 * Usage: node scripts/load-test-http.js [users=100] [iterations=3] [token-address]
 */
const { performance } = require('node:perf_hooks');

const users = Number(process.argv[2] || 100);
const iterations = Number(process.argv[3] || 3);
const token = (process.argv[4] || '0x24797f2c26b35d811c985c7c3c96d7c823c7cc3b').toLowerCase();
const api = (process.env.E2E_API_URL || 'https://orbafun-api.onrender.com').replace(/\/$/, '');
const web = (process.env.E2E_WEB_URL || 'https://www.orba.fun').replace(/\/$/, '');

if (!Number.isInteger(users) || users < 1 || users > 1_000) throw new Error('users must be 1..1000');
if (!Number.isInteger(iterations) || iterations < 1 || iterations > 100) throw new Error('iterations must be 1..100');

const routes = [
  () => `${web}/`,
  () => `${web}/explore`,
  () => `${web}/trade/${token}`,
  () => `${api}/tokens/${token}`,
  () => `${api}/tokens/${token}/trades?limit=50`,
  () => `${api}/tokens/${token}/candles?interval=1m&limit=100`,
  () => `${api}/tokens/${token}/metadata`,
];

async function request(url) {
  const started = performance.now();
  try {
    const response = await fetch(url, { headers: { accept: 'application/json,text/html' } });
    await response.arrayBuffer();
    return { url, status: response.status, ok: response.ok, ms: performance.now() - started };
  } catch (error) {
    return { url, status: 0, ok: false, ms: performance.now() - started, error: error.message };
  }
}

function percentile(sorted, value) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)] || 0;
}

async function main() {
  const started = performance.now();
  const jobs = Array.from({ length: users }, (_, user) => (async () => {
    const results = [];
    for (let iteration = 0; iteration < iterations; iteration++) {
      results.push(await request(routes[(user + iteration) % routes.length]()));
    }
    return results;
  })());
  const results = (await Promise.all(jobs)).flat();
  const elapsed = performance.now() - started;
  const durations = results.map((result) => result.ms).sort((a, b) => a - b);
  const failures = results.filter((result) => !result.ok);
  const statuses = results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});

  console.log(JSON.stringify({
    users,
    iterations,
    requests: results.length,
    elapsedMs: Number(elapsed.toFixed(1)),
    requestsPerSecond: Number((results.length / (elapsed / 1_000)).toFixed(2)),
    successRatePct: Number((((results.length - failures.length) / results.length) * 100).toFixed(2)),
    latencyMs: {
      min: Number((durations[0] || 0).toFixed(1)),
      p50: Number(percentile(durations, 0.5).toFixed(1)),
      p95: Number(percentile(durations, 0.95).toFixed(1)),
      p99: Number(percentile(durations, 0.99).toFixed(1)),
      max: Number((durations.at(-1) || 0).toFixed(1)),
    },
    statuses,
    failures: failures.slice(0, 10),
  }, null, 2));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
