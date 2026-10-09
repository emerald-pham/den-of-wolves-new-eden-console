// HTTP-only probe. Parent must separately allocate/start the Hosting emulator.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const origin = new URL(process.env.CASTING_HOSTING_ORIGIN ?? '');
assert.ok(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname) && origin.port, 'explicit loopback emulator origin required');
const deadline = Date.parse(process.env.CASTING_HOSTING_CHECK_DEADLINE ?? '');
assert.ok(Number.isFinite(deadline) && deadline > Date.now() && deadline - Date.now() <= 300000, 'bounded check deadline required');
const output = process.env.CASTING_HOSTING_EVIDENCE;
assert.ok(output, 'evidence output path required');
const report = { startedAt: new Date().toISOString(), origin: origin.origin, cases: [] };
async function request(path, method) {
  let url = new URL(path, origin), hops = [];
  for (let count = 0; count < 4; count++) {
    assert.equal(url.origin, origin.origin, 'redirect must stay in allocated emulator');
    assert.ok(Date.now() < deadline, 'stop-check deadline');
    const response = await fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(Math.min(5000, deadline - Date.now())) });
    const headers = Object.fromEntries(response.headers), body = await response.text();
    hops.push({ url: url.href, status: response.status, headers });
    if ([301, 302, 303, 307, 308].includes(response.status)) { assert.ok(headers.location); url = new URL(headers.location, url); continue; }
    return { status: response.status, headers, body, hops };
  }
  throw new Error('redirect loop');
}
try {
  for (const method of ['GET', 'HEAD']) {
    for (const path of ['/casting', '/casting/', '/casting?source=direct', '/casting/index.html', '/casting/deep']) {
      const result = await request(path, method); report.cases.push({ path, method, ...result, body: undefined });
      assert.equal(result.status, 200);
      if (path.includes('?')) assert.equal(new URL(result.hops.at(-1).url).search, new URL(path, origin).search, 'canonical redirect preserves query');
      for (const [key, value] of [['cache-control', 'no-store'], ['referrer-policy', 'no-referrer'], ['x-robots-tag', 'noindex, nofollow, noarchive']]) assert.equal(result.headers[key], value, `${method} ${path}: ${key}`);
      if (method === 'GET') { assert.match(result.body, /id="casting-app"/); assert.doesNotMatch(result.body, /id="root"/); }
      else assert.equal(result.body, '');
    }
  }
  for (const path of ['/', '/casting-other']) {
    const result = await request(path, 'GET'); report.cases.push({ path, method: 'GET', ...result, body: undefined });
    assert.equal(result.status, 200); assert.match(result.body, /id="root"/); assert.doesNotMatch(result.body, /id="casting-app"/);
  }
  // HTTP reloads of direct hash links request this same URL; hashes stay client-side.
  for (let repeat = 0; repeat < 2; repeat++) assert.match((await request('/casting', 'GET')).body, /id="casting-app"/);
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.message; process.exitCode = 1; }
finally { report.finishedAt = new Date().toISOString(); await writeFile(output, JSON.stringify(report, null, 2)); }
