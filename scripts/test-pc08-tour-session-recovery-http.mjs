import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createPc07AuthenticatedSession} from './pc07-authenticated-session.mjs';

const directory = process.env.PC08_RECOVERY_EVIDENCE_DIR;
const baseUrl = process.env.PC08_UI_URL;
assert.ok(directory && baseUrl, 'An external evidence directory and isolated app URL are required.');
await mkdir(directory, {recursive: true});
const browser = await chromium.launch({channel: 'chrome', headless: true});
const context = await browser.newContext({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
const page = await context.newPage();
const errors = [], cases = [];
let fixture;
page.on('pageerror', error => errors.push(error.message));
async function joinThroughUi(code) {
  await page.goto(baseUrl);
  await page.getByRole('button', {name: /^REDUCED MOTION/i}).click();
  await page.getByRole('textbox', {name: 'Session code', exact: true}).fill(code);
  await page.getByRole('button', {name: 'Join a session', exact: true}).click();
  const waiver = page.getByRole('dialog', {name: 'CODE OF CONDUCT', exact: true});
  await waiver.waitFor();
  for (const checkbox of await waiver.getByRole('checkbox', {name: /^Acknowledge regulation/}).all()) await checkbox.check();
  const acknowledge = waiver.getByRole('button', {name: 'Acknowledge regulations and continue', exact: true});
  await acknowledge.and(page.locator(':enabled')).waitFor();
  await acknowledge.click();
  await page.waitForFunction(async () => {
    const {useSessionStore} = await import('/src/store/useSessionStore.ts');
    return Boolean(useSessionStore.getState().me);
  });
  return page.evaluate(async () => {
    const {auth} = await import('/src/lib/firebase.ts');
    return {localId: auth().currentUser.uid, idToken: await auth().currentUser.getIdToken()};
  });
}
async function identity() {
  return page.evaluate(async () => {
    const {auth} = await import('/src/lib/firebase.ts');
    const {useSessionStore} = await import('/src/store/useSessionStore.ts');
    const state = useSessionStore.getState();
    return {uid: auth().currentUser?.uid, memberUid: state.me?.uid, sessionId: state.session?.id,
      roleId: state.me?.assignedRoleId, connection: state.connection, freshness: state.sessionSnapshotFreshness};
  });
}
try {
  fixture = await createPc07AuthenticatedSession('PC08 ordinary tour return', 18,
    {keepAlive: true, browserRoleId: 'executive-officer', joinBrowserPlayer: joinThroughUi});
  await page.waitForFunction(async ({sessionId}) => {
    const {useSessionStore} = await import('/src/store/useSessionStore.ts');
    const state = useSessionStore.getState();
    return state.session?.id === sessionId && state.me?.assignedRoleId === 'executive-officer' && state.connection === 'live';
  }, {sessionId: fixture.sessionId});
  const before = await identity();
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    await page.setViewportSize({width, height});
    const writes = [];
    const watch = request => {if (request.method() !== 'GET') writes.push({method: request.method(), url: request.url()});};
    await page.goto(`${baseUrl}/pc08-review.html`);
    await page.getByRole('note', {name: 'Prepared review boundary'}).waitFor();
    page.on('request', watch);
    await page.getByRole('button', {name: '3 Fleet fighters', exact: true}).click();
    await page.getByRole('button', {name: 'Pass Fighter Wing Alpha', exact: true}).click();
    await page.getByRole('button', {name: '4 Boarding defence', exact: true}).click();
    await page.getByRole('button', {name: 'Commander sample', exact: true}).click();
    await page.getByRole('button', {name: 'Do not lead', exact: true}).click();
    assert.deepEqual(writes, [], 'Prepared choices must not send session writes.');
    page.off('request', watch);
    await page.getByRole('link', {name: 'Return to station and console chooser', exact: true}).click();
    await page.waitForFunction(async ({uid, sessionId}) => {
      const {auth} = await import('/src/lib/firebase.ts');
      const {useSessionStore} = await import('/src/store/useSessionStore.ts');
      const state = useSessionStore.getState();
      return auth().currentUser?.uid === uid && state.me?.uid === uid && state.session?.id === sessionId &&
        state.connection === 'live' && state.sessionSnapshotFreshness === 'server';
    }, {uid: before.uid, sessionId: fixture.sessionId});
    const after = await identity();
    assert.deepEqual([after.uid, after.memberUid, after.sessionId, after.roleId],
      [before.uid, before.memberUid, before.sessionId, before.roleId]);
    await page.waitForURL(/#\/console/);
    await page.getByRole('heading', {name: 'Stations and consoles', exact: true}).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await page.screenshot({path: `${directory}/${width}x${height}-recovered-session.png`, fullPage: true});
    cases.push({width, height, sameIdentity: true, sameSession: true, sameAssignedRole: true,
      freshServerRecovery: true, visibleParentAndSessionControls: true, preparedWrites: writes});
  }
  assert.deepEqual(errors, []);
  await writeFile(`${directory}/result.json`, `${JSON.stringify({kind: 'normal-authenticated-local-emulator-ui-tour-recovery',
    sourceCommit: process.env.PC08_SOURCE_COMMIT, ordinaryRoster: 18, cases, errors,
    authStorageInjected: false, productionGameplay: false, completedAt: new Date().toISOString()}, null, 2)}\n`);
} catch (error) {
  await page.screenshot({path: `${directory}/failure.png`, fullPage: true});
  await writeFile(`${directory}/failure.json`, `${JSON.stringify({failure: String(error), body: await page.locator('body').innerText(), errors}, null, 2)}\n`);
  throw error;
} finally {
  const keepCleanupAlive = setInterval(() => {}, 1000);
  try {await browser.close(); await fixture?.cleanup(); await fixture?.db.terminate();}
  finally {clearInterval(keepCleanupAlive);}
}
