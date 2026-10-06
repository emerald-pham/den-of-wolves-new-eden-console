import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { constants, createContext, Script, SyntheticModule } from 'node:vm';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import ScoutRequestControls from './ScoutRequestControls';

// The production Scout control, authority/parser/service, Zustand store, public
// selector and specialist caller/driver all run. Only transport and the separately
// tested private report delivery adapter are inert. No browser, Auth or DB runs.
const transport = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => transport.call }));
vi.mock('@/lib/firebase', () => ({ functions: () => ({}) }));
vi.mock('./ScoutReportController', () => ({ default: () => null }));
const nativeScript = (name: string) => pathToFileURL(resolve(process.cwd(), 'scripts', name)).href;
const nativeImport = (name: string) => new Script('import(url)', {
  importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
}).runInNewContext({ url: nativeScript(name) });
const { createTwoBrowserGameplay } = await nativeImport('pc10-two-browser-gameplay.mjs');
const { createSpecialistGameplayDriver } = await nativeImport('pc10-specialist-gameplay.mjs');
const { runPc10SpecialistAction } = await nativeImport('pc10-specialist-phases.mjs');
// Bind the generic surface to its actual production callback rather than
// supplying fixture-only generation/HY/berth fields it does not return.
const observerFile = ts.createSourceFile('full-game-proof.mjs', readFileSync(resolve(process.cwd(),
  'scripts/pc10-full-game-demo-ui-proof.mjs'), 'utf8'), ts.ScriptTarget.Latest, true);
const observers: ts.FunctionDeclaration[] = [];
function findObserver(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'observe') observers.push(node);
  ts.forEachChild(node, findObserver);
}
findObserver(observerFile);
expect(observers).toHaveLength(1);
const returned = observers[0].body!.statements[0] as ts.ReturnStatement;
const genericCallbackSource = (returned.expression as ts.CallExpression).arguments[0].getText(observerFile);
const genericCallback = new Script(`(${genericCallbackSource})`).runInNewContext();
const sid = 'native-specialist-session', uid = 'private-native-wing', roleId = 'wing-commander';
const uidHash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 16);
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  transport.call.mockReset();
  const store = useSessionStore.getState();
  store.reset();
  store.setIdentity({ id: sid, name: 'Native table', joinCode: '4821', phase: 'active', currentTurn: 1,
    activeRoleIds: [roleId], activeVesselIds: ['aegis'], ownerUid: 'native-gm',
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['aegis'], craftIds: ['starlight'] },
    currentActorBerthAuthority: { sessionId: sid, actorUid: uid, groupId: 'fleet-1', role: 'player',
      connectionGeneration: 3, assignedRoleId: roleId, activeConsoleRoleId: roleId,
      replacementRoleId: null, replacementStatus: null, shipId: 'aegis' },
    createdAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z',
    turnPhase: { turn: 1, teamPhaseEndsAt: '2000-01-01T00:00:00.000Z',
      openAirspaceEndsAt: '2099-01-01T00:00:00.000Z',
      airspace: { state: 'lifted', tickerActive: true, pressAccess: false } },
  }, { uid, sessionId: sid, displayName: 'Wing', role: 'player', connected: true,
    assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId, fleetGroupId: 'fleet-1',
    connectionGeneration: 3, replacementRoleId: null, replacementStatus: null,
    joinedAt: '2026-10-06T00:00:00.000Z' });
  store.setConnection('live'); store.setSessionSnapshotFreshness('server');
});

function fixture({ beforeCapture, beforeClick, afterFill, duringSecondSelection, replayDrift = false }:
  { beforeCapture?: () => void; beforeClick?: () => void; afterFill?: () => void;
    duringSecondSelection?: () => void; replayDrift?: boolean } = {}) {
  const events: string[] = [], posts: Record<string, unknown>[] = [], replays: unknown[] = [];
  let path = '/ships/aegis/roles/wing-commander', authUid = uid, responseResolve: (value: unknown) => void;
  let documentTimeOrigin = 1000;
  let selects = 0, fills = 0, clicks = 0, observers = 0, saved: unknown;
  function Path() { path = useLocation().pathname; return null; }
  render(<MemoryRouter initialEntries={[path]}><Path /><Routes>
    <Route path="/ships/aegis/roles/wing-commander" element={<Link to="/shuttles/starlight">Open Starlight shuttle console</Link>} />
    <Route path="/shuttles/starlight" element={<><Link to="/ships/aegis/roles/wing-commander">Back to AEGIS Wing Commander console</Link><ScoutRequestControls entitlementId="starlight" /></>} />
  </Routes></MemoryRouter>);
  const currentActor = async () => evaluate(genericCallback, '/src/store/useSessionStore.ts');
  let richSamplesInSelection = 0;
  async function evaluate(callback: (...args: never[]) => unknown, input: unknown) {
    // Execute the actual browser-serialized current-document callback, with no
    // Node globals or SDK/network module available to it.
    const browser = createContext({ input, crypto: webcrypto, TextEncoder, document, performance: { timeOrigin: documentTimeOrigin } });
    const modules = new Map<string, SyntheticModule>();
    for (const [name, exports] of [
      ['/src/store/useSessionStore.ts', { useSessionStore }],
      ['/src/lib/firebase.ts', { auth: () => ({ currentUser: authUid ? { uid: authUid } : null }) }],
      ['/src/lib/demoActorContext.ts', { activeDemoActorProfile: { roleId, sessionId: sid } }],
    ] as const) {
      const module = new SyntheticModule(Object.keys(exports), function () {
        for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
      }, { context: browser });
      await module.link(() => { throw new Error('No extra import in the native selector.'); });
      await module.evaluate(); modules.set(name, module);
    }
    const value = plain(await new Script(`(${callback.toString()})(input)`, {
      importModuleDynamically: async name => {
        const module = modules.get(name); if (!module) throw new Error(`No SDK or extra source import ${name}`); return module;
      },
    }).runInContext(browser));
    if (callback.toString().includes('currentMemberBerthPresent')) {
      richSamplesInSelection++;
      if (selects === 2 && richSamplesInSelection === 1) await act(async () => { duringSecondSelection?.(); });
    }
    return value;
  }
  const locate = (query: () => HTMLElement[]) => ({
    isVisible: async () => query().length === 1 && !query()[0].hidden,
    isEnabled: async () => query().length === 1 && !query()[0].matches(':disabled'),
    first() { return this; },
    waitFor: async () => { expect(query()).toHaveLength(1); },
    click: async () => {
      const node = query()[0]; expect(node).toBeTruthy();
      if (node.tagName === 'BUTTON') {
        expect(node).toBeEnabled(); beforeClick?.(); expect(node.isConnected).toBe(true);
        clicks++; events.push('click');
      } else events.push('normal-route-link');
      await act(async () => { fireEvent.click(node); });
      if (node.tagName === 'BUTTON') await vi.waitFor(() => expect(posts).toHaveLength(1));
    },
    fill: async (value: string) => {
      fills++; events.push('fill'); const node = query()[0]; expect(node).toBeTruthy();
      await act(async () => { fireEvent.change(node, { target: { value } }); });
      await act(async () => { afterFill?.(); });
    },
  });
  const page = {
    url: () => `http://native.invalid/#${path}`,
    evaluate,
    waitForURL: async (predicate: (url: URL) => boolean) => expect(predicate(new URL(page.url()))).toBe(true),
    getByRole: (kind: 'region' | 'button' | 'link', options: { name: string | RegExp; exact?: boolean }) => {
      if (kind === 'region') return {
        getByRole: (childKind: 'button', childOptions: { name: string }) => locate(() => {
          const region = screen.queryByRole('region', { name: options.name, exact: options.exact });
          return region ? within(region).queryAllByRole(childKind, { name: childOptions.name }) : [];
        }),
        getByLabel: (name: string) => locate(() => {
          const region = screen.queryByRole('region', { name: options.name, exact: options.exact });
          return region ? within(region).queryAllByLabelText(name) : [];
        }),
      };
      return locate(() => screen.queryAllByRole(kind, { name: options.name, exact: options.exact }));
    },
    waitForResponse: () => {
      observers++; events.push('arm-response');
      return new Promise(resolve => { responseResolve = resolve; });
    },
  };
  transport.call.mockImplementation(async payload => {
    events.push('ordinary-sdk'); posts.push(plain(payload));
    const result = { status: 'requested', resolution: 'pending', requestId: payload.requestId,
      sessionId: sid, cycle: 1, entitlementId: 'starlight', source: 'craft', ownerRoleId: roleId,
      anchorShipId: 'aegis', receivingShipId: 'aegis', targetCoordinate: payload.targetCoordinate };
    responseResolve({ url: () => 'http://native.invalid/us-central1/requestScout',
      request: () => ({ method: () => 'POST', postDataJSON: () => ({ data: plain(payload) }) }),
      json: async () => ({ result }), ok: () => true, status: () => 200 });
    return { data: result };
  });
  const crew = { page, observe: currentActor, storeModuleUrl: () => '/src/store/useSessionStore.ts',
    until: async (_label: string, predicate: (actor: unknown) => boolean) => {
      const actor = await currentActor(); expect(predicate(actor)).toBe(true); return actor;
    },
    callable: async (endpoint: string, payload: Record<string, unknown>) => {
      expect(endpoint).toBe('requestScout'); replays.push(plain(payload));
      const result = { status: 'replayed', resolution: 'pending', requestId: payload.requestId, sessionId: sid,
        cycle: 1, entitlementId: 'starlight', source: 'craft', ownerRoleId: roleId, anchorShipId: 'aegis',
        receivingShipId: 'aegis', targetCoordinate: replayDrift ? '9999' : payload.targetCoordinate };
      return { status: 'committed', result };
    },
  };
  const gm = {}, context = { gm, crew, initial: { sessionId: sid, joinCode: 'NATIVE' },
    roster: [{ roleId, uidHash: uidHash(uid) }], started: { fullGameDemo: { status: 'active', progression: 'manual' } }, directory: '/tmp/native-specialist-no-files' };
  const actual = createTwoBrowserGameplay(context);
  const game = { ...actual,
    // The native-only deadline is finite; production's existing defaults are untouched.
    select: async (selectedRole: string) => { selects++; richSamplesInSelection = 0;
      return actual.select(selectedRole, { deadlineAt: Date.now() + 500 }); },
    state: async () => ({ live: true, sessionId: sid, cycle: 1 }),
    save: async (_name: string, value: unknown) => { saved = value; },
  };
  const driver = createSpecialistGameplayDriver(game, { timeoutMs: 0, intervalMs: 0 });
  const run = () => runPc10SpecialistAction({ game, driver: { capture: async (args: unknown) => {
    await act(async () => { beforeCapture?.(); }); return driver.capture(args);
  } }, actionId: 'wing-starlight-scout', targetCoordinate: '1413',
    inspect: async () => {
      expect(screen.getByRole('status')).toHaveTextContent(/request recorded/i);
      return { ready: true, gmRevision: 7, crewRevision: 7, renderedStatusCode: 'public-result-visible' };
    },
  });
  return { run, events, posts, replays, game, changeAuth: (value: string) => { authUid = value; },
    replaceDocument: () => { documentTimeOrigin += 1000; },
    counts: () => ({ selects, fills, clicks, observers }), saved: () => saved };
}

it('keeps the original prepared Scout form through the real public selector and records one ordinary request', async () => {
  const f = fixture();
  const result = await f.run();
  expect(result.status).toBe('captured');
  expect(f.counts()).toEqual({ selects: 2, fills: 1, clicks: 1, observers: 1 });
  expect(f.events.indexOf('fill')).toBeLessThan(f.events.indexOf('arm-response'));
  expect(f.events.indexOf('arm-response')).toBeLessThan(f.events.indexOf('ordinary-sdk'));
  expect(f.posts).toHaveLength(1); expect(f.replays).toEqual(f.posts);
  expect(result.evidence.request.targetCoordinate).toBeUndefined();
  expect(result.evidence.request.targetCoordinateHash).toHaveLength(64);
  expect(JSON.stringify(result.evidence)).not.toContain(uid);
  expect(JSON.stringify(result.evidence)).not.toContain('1413');
});

it.each([
  ['UID', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, uid: 'foreign-uid' })],
  ['SID', () => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!, id: 'foreign-sid' })],
  ['console', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, activeConsoleRoleId: null })],
  ['assignment', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, assignedRoleId: 'comms-officer' })],
  ['replacement', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementStatus: 'awaiting-re-role' })],
  ['connection', () => useSessionStore.getState().setConnection('offline')],
  ['freshness', () => useSessionStore.getState().setSessionSnapshotFreshness('cache')],
  ['phase', () => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    turnPhase: { ...useSessionStore.getState().session!.turnPhase!, airspace: { state: 'restricted', tickerActive: false, pressAccess: false } } })],
] as const)('does not arm a mutation observer after original %s readiness is lost', async (_label, change) => {
  const f = fixture({ beforeCapture: change });
  await expect(f.run()).rejects.toThrow();
  expect(f.counts().clicks).toBe(0); expect(f.counts().observers).toBe(0);
  expect(f.posts).toHaveLength(0); expect(f.replays).toHaveLength(0);
});

it.each([
  ['generation', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, connectionGeneration: 4 })],
  ['hydration', () => useSessionStore.setState({ identityHydrationRevision: 2 })],
  ['group', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, fleetGroupId: 'fleet-2' })],
] as const)('retains the real rich selector original %s fence before final preparation', async (_label, change) => {
  const f = fixture({ duringSecondSelection: change });
  await expect(f.run()).rejects.toThrow(/changed/i);
  expect(f.counts().observers).toBe(0); expect(f.counts().clicks).toBe(0);
  expect(f.posts).toHaveLength(0); expect(f.replays).toHaveLength(0);
});

it('does not substitute a different exact SDK replay receipt', async () => {
  const f = fixture({ replayDrift: true });
  await expect(f.run()).rejects.toThrow(/replay must agree/i);
  expect(f.posts).toHaveLength(1); expect(f.replays).toHaveLength(1);
});

it.each(['Auth', 'document'] as const)('rejects the original %s changing during sole final preparation', async changed => {
  const f = fixture({ afterFill: () => changed === 'Auth' ? f.changeAuth('foreign-auth') : f.replaceDocument() });
  await expect(f.run()).rejects.toThrow(/actor|original/i);
  expect(f.counts().fills).toBe(1); expect(f.counts().observers).toBe(0);
  expect(f.counts().clicks).toBe(0); expect(f.posts).toHaveLength(0); expect(f.replays).toHaveLength(0);
});

it.each([
  ['restricted phase', () => useSessionStore.getState().setSession({ ...useSessionStore.getState().session!,
    turnPhase: { ...useSessionStore.getState().session!.turnPhase!, airspace: { state: 'restricted', tickerActive: false, pressAccess: false } } })],
  ['source cache', () => useSessionStore.getState().setSessionSnapshotFreshness('cache')],
  ['replaced holder', () => useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, replacementStatus: 'awaiting-re-role' })],
] as const)('fails the current ordinary control before arming if %s arrives during preparation', async (_name, afterFill) => {
  const f = fixture({ afterFill });
  await expect(f.run()).rejects.toThrow(/control/i);
  expect(f.counts().fills).toBe(1); expect(f.counts().observers).toBe(0);
  expect(f.counts().clicks).toBe(0); expect(f.posts).toHaveLength(0); expect(f.replays).toHaveLength(0);
});
