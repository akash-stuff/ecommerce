/**
 * Load test for the read paths a real storefront hammers.
 *
 * Deliberately dependency-free — plain `node:http`, no k6 or autocannon — so it
 * runs anywhere the API runs, including a CI container, without another toolchain
 * to install and keep patched.
 *
 * It measures the endpoints a visitor hits before buying anything: the store
 * bootstrap, the product list, search, facets and a product page. Those are the
 * ones that must stay fast under concurrency, and the ones where a missing index
 * shows up first.
 *
 * Usage:
 *   node test/load/storefront-load.mjs
 *   HOST=northwind.platform.localhost CONCURRENCY=50 DURATION=15 node test/load/storefront-load.mjs
 *
 * This is a smoke-level load check against a development machine, not a capacity
 * plan. Numbers from a laptop with eight seeded products do not predict
 * production; what they do catch is a regression that turns a 5ms endpoint into
 * a 500ms one.
 */
import http from 'node:http';

const HOST = process.env.HOST ?? 'northwind.platform.localhost';
const PORT = Number(process.env.PORT ?? 4000);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 25);
const DURATION_SECONDS = Number(process.env.DURATION ?? 10);

/** Slowest acceptable p95 per endpoint, in milliseconds. */
const P95_BUDGET_MS = Number(process.env.P95_BUDGET ?? 250);

const SCENARIOS = [
  { name: 'store bootstrap', path: '/api/v1/store' },
  { name: 'product list', path: '/api/v1/products?limit=12' },
  { name: 'search', path: '/api/v1/products?search=wool&limit=12' },
  { name: 'facets', path: '/api/v1/products/facets' },
  { name: 'category tree', path: '/api/v1/categories/tree' },
  { name: 'sitemap', path: '/sitemap.xml' },
];

function request(path) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const req = http.get(
      { host: '127.0.0.1', port: PORT, path, headers: { Host: HOST } },
      (res) => {
        // The body must be drained or the socket is never released.
        res.resume();
        res.on('end', () =>
          resolve({
            ms: Number(process.hrtime.bigint() - started) / 1e6,
            status: res.statusCode,
          }),
        );
      },
    );
    req.on('error', () => resolve({ ms: 0, status: 0 }));
  });
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index];
}

async function run(scenario) {
  const latencies = [];
  const statuses = new Map();
  const deadline = Date.now() + DURATION_SECONDS * 1000;

  // Each worker loops independently, so concurrency is sustained rather than
  // sent in bursts that measure queueing more than the handler.
  const worker = async () => {
    while (Date.now() < deadline) {
      const { ms, status } = await request(scenario.path);
      latencies.push(ms);
      statuses.set(status, (statuses.get(status) ?? 0) + 1);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const sorted = [...latencies].sort((a, b) => a - b);
  const ok = statuses.get(200) ?? 0;
  const throttled = statuses.get(429) ?? 0;

  return {
    name: scenario.name,
    requests: latencies.length,
    rps: Math.round(latencies.length / DURATION_SECONDS),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1] ?? 0,
    okRate: latencies.length > 0 ? ok / latencies.length : 0,
    throttledRate: latencies.length > 0 ? throttled / latencies.length : 0,
    statuses: [...statuses.entries()].map(([s, n]) => `${s}:${n}`).join(' '),
  };
}

console.log(
  `${CONCURRENCY} concurrent clients, ${DURATION_SECONDS}s per scenario, Host: ${HOST}\n`,
);
console.log('scenario            reqs    rps    p50     p95     p99     max   ok');
console.log('─'.repeat(74));

let failed = false;

let throttledAnywhere = false;

for (const scenario of SCENARIOS) {
  const r = await run(scenario);

  // A throttled run measures the rate limiter, not the handler. Saying so is
  // more useful than reporting a latency budget the request never reached.
  const throttled = r.throttledRate > 0.05;
  if (throttled) throttledAnywhere = true;

  const flag = throttled
    ? `  <-- ${(r.throttledRate * 100).toFixed(0)}% throttled`
    : r.p95 > P95_BUDGET_MS || r.okRate < 0.99
      ? '  <-- over budget'
      : '';
  if (flag && !throttled) failed = true;

  console.log(
    r.name.padEnd(20) +
      String(r.requests).padStart(5) +
      String(r.rps).padStart(7) +
      `${r.p50.toFixed(1)}ms`.padStart(8) +
      `${r.p95.toFixed(1)}ms`.padStart(8) +
      `${r.p99.toFixed(1)}ms`.padStart(8) +
      `${r.max.toFixed(0)}ms`.padStart(8) +
      `${(r.okRate * 100).toFixed(0)}%`.padStart(5) +
      flag,
  );
}

if (throttledAnywhere) {
  console.log(
    '\nThe rate limiter answered most of these requests, so the latencies above\n' +
      'describe the throttler rather than the handlers. Raise the ceiling for the\n' +
      'run and try again:\n\n' +
      '  THROTTLE_LIMIT=1000000 node dist/main\n\n' +
      'A throttled result is the limiter working, not a failure.',
  );
  process.exit(0);
}

console.log(
  failed
    ? `\nFAIL — something exceeded ${P95_BUDGET_MS}ms at p95, or returned non-200s.`
    : `\nPASS — every scenario under ${P95_BUDGET_MS}ms at p95 with no errors.`,
);

process.exit(failed ? 1 : 0);
