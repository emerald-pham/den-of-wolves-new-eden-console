import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createPc07AuthenticatedSession } from './pc07-authenticated-session.mjs';
import { createPc09BrowserProof } from './pc09-browser-proof.mjs';

const directory = process.env.PC09_EXECUTIVE_EVIDENCE_DIR;
const baseUrl = process.env.PC09_UI_URL;
assert.ok(directory && baseUrl, 'External evidence and the isolated app URL are required.');
await mkdir(directory, { recursive: true });
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: new URL('../', import.meta.url), encoding: 'utf8',
}).trim();
const b = await createPc09BrowserProof(baseUrl);
let f;
const cases = [];
try {
  f = await createPc07AuthenticatedSession('PC09 ordinary Executive Officer workspace', 18, {
    keepAlive: true,
    browserRoleId: 'executive-officer',
    joinBrowserPlayer: b.join,
  });
  const eo = f.byRole('executive-officer');
  await b.page.goto(`${baseUrl}/#/console`);
  await b.page.getByRole('heading', { name: 'Stations and consoles', exact: true }).waitFor();
  await b.untilIdentity('fresh ordinary EO chooser', state =>
    state.uid === eo.localId && state.uid === state.memberUid && state.sessionId === f.sessionId &&
    state.roleId === 'executive-officer' && state.connection === 'live' && state.freshness === 'server');
  await b.page.getByRole('link', { name: 'AEGIS // Executive Officer // HELD BY YOU', exact: true }).click();
  await b.untilIdentity('current EO console', state => state.activeConsoleRoleId === 'executive-officer' &&
    state.connection === 'live' && state.freshness === 'server');
  const workspace = b.page.getByRole('region', { name: 'AEGIS Executive Officer console', exact: true });
  await workspace.waitFor();
  for (const name of ['Command and Control', 'Fighter Bay Alpha', 'Fighter Bay Bravo', 'Missile Launchers', 'Point Defence Lasers']) {
    await workspace.getByRole('article', { name: `${name} system // operational`, exact: true }).waitFor();
  }
  for (const [width, height] of [[320, 844], [390, 844], [844, 390], [1440, 900]]) {
    await b.page.setViewportSize({ width, height });
    const geometry = await b.assertGeometry();
    const font = await workspace.evaluate(element => getComputedStyle(element).fontFamily);
    assert.match(font, /mono|courier|menlo|consolas/i, 'The ordinary workspace uses the issued CIC monospace family.');
    await b.page.screenshot({ path: `${directory}/${width}x${height}-executive.png`, fullPage: true });
    cases.push({ width, height, geometry, font, currentServerAuthority: true });
  }
  await b.page.getByRole('link', { name: 'Open Pallas shuttle console', exact: true }).click();
  await b.page.getByRole('heading', { name: 'I.C.S.S. Pallas', exact: true }).waitFor();
  await b.page.getByRole('heading', { name: 'Cargo transfer', exact: true }).waitFor();
  await b.page.getByRole('heading', { name: 'Boarding defence', exact: true }).waitFor();
  await b.page.getByRole('heading', { name: 'Fuelled redeployment', exact: true }).waitFor();
  assert.equal((await b.identity()).activeConsoleRoleId, 'executive-officer');
  await b.page.getByRole('link', { name: /Back to (assigned|AEGIS Executive Officer) console/i }).click();
  await workspace.waitFor();
  await b.context.setOffline(true);
  await b.untilIdentity('EO browser network interruption', state => state.connection === 'offline');
  await b.context.setOffline(false);
  const reconnect = f.ok(await f.call(eo, 'resumeSession', { sessionId: f.sessionId }), 'ordinary EO reconnect');
  assert.equal(reconnect.player.assignedRoleId, 'executive-officer');
  f.ok(await f.call(eo, 'refreshPresence', { sessionId: f.sessionId, activeConsoleRoleId: 'executive-officer' }),
    'restore current active EO console');
  await b.page.reload();
  await b.untilIdentity('same-actor fresh recovered EO', state =>
    state.uid === eo.localId && state.uid === state.memberUid && state.sessionId === f.sessionId &&
    state.roleId === 'executive-officer' && state.connection === 'live' && state.freshness === 'server');
  await workspace.waitFor();
  assert.deepEqual(b.errors, []);
  assert.deepEqual(f.heartbeatFailures, []);
  await writeFile(`${directory}/result.json`, `${JSON.stringify({
    kind: 'normal-authenticated-local-emulator-ui-http-workspace', sourceCommit,
    proofScriptCandidate: true, ordinaryRoster: 18, preparedScene: false,
    checks: { realEOChooser: true, realBattleSystemShell: true,
      realPallasCargoBoardingRelocationRoute: true, visiblePallasReturn: true,
      sameActorNetworkRecoveryAndReload: true, noAuthStorageInjection: true },
    cases, moduleUrls: b.moduleUrls(), errors: b.errors, productionGameplay: false,
    physicalDeviceProof: false, authenticationSerialized: false,
    // The complete attack driver separately proves real warhead/range/C&C
    // mutations. This workspace driver never grants that missing proof itself.
    remainingAcceptance: ['ordinary AEGIS maintenance, composed attack actions and integrated release'],
    completedAt: new Date().toISOString(),
  }, null, 2)}\n`);
} catch (error) {
  await b.page.screenshot({ path: `${directory}/failure.png`, fullPage: true }).catch(() => {});
  await writeFile(`${directory}/failure.json`, `${JSON.stringify({
    sourceCommit, message: error.message, cases, errors: b.errors,
    body: await b.page.locator('body').innerText().catch(() => ''),
  }, null, 2)}\n`);
  throw error;
} finally {
  const cleanupKeepalive = setInterval(() => {}, 1000);
  try { await b.browser.close(); await f?.cleanup(); await f?.db.terminate(); }
  finally { clearInterval(cleanupKeepalive); }
}
