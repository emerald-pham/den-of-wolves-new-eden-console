import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import ts from 'typescript';
import { parsePdfEscortWingState, beginPdfEscortWingAttack, initialPdfEscortWingState } from '../../functions/src/pdfEscortWingState';
import { authorizeRefineryFighterBayLaunch } from '../../functions/src/refineryFighterBay';
import { emptyMaintenanceCycle } from '../../functions/src/maintenance';
import { turnPhaseState } from '../../functions/src/turnZero';
import { recommendedRoleIds } from '../../functions/src/roleConfiguration';
import { isResourceShipId } from '../../functions/src/resources';
import * as fighterCombat from '../../functions/src/fighterWingCombat';
import * as fighterCounts from '../../functions/src/fighterWings';
import * as rangeMath from '../../functions/src/wolfCombatMath';
import type * as FirestoreModule from '@/lib/firestore';
import WolfEscortRangeActionPanel from './WolfEscortRangeActionPanel';
import WolfFighterRangeActionPanel from './WolfFighterRangeActionPanel';
import type { WolfAttackMemberView } from '@/types/game';
import { isCanonicalRequestId } from '../../functions/src/requestGuards';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { acceptServerSessionAuthority, sessionSnapshotAuthorityFor } from '@/lib/sessionSnapshotAuthority';
import * as sdkAuthority from '@/lib/sessionSnapshotAuthority';
// @ts-expect-error Existing native proof consumer has no TypeScript declaration.
import { dispatchStationCrewChoice } from '../../scripts/pc10-station-crew-dispatch.mjs';
// @ts-expect-error Existing browser member sampler has no TypeScript declaration.
import { observeFullGameDemoPresentationMember } from '../../scripts/pc10-full-game-demo-proof-helpers.mjs';
import { getPdfEscortWingLaunch } from '@/lib/sessionService';
import type { GameSession, Player } from '@/types/game';
import PdfEscortWingReference from './PdfEscortWingReference';

const io = vi.hoisted(() => ({ call: vi.fn(), subscribe: vi.fn(), auth: { currentUser: { uid: 'original-pdf' } } }));
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_instance: unknown, name: string) =>
  (payload: unknown) => io.call(name, payload) }));
vi.mock('@/lib/firestore', async importOriginal => ({ ...await importOriginal<typeof FirestoreModule>(), subscribeWolfAttackMemberView: io.subscribe }));
vi.mock('@/lib/firebase', () => ({ app: vi.fn(), auth: () => io.auth, functions: () => ({}) }));

// Attempt29's retained raw callable DTO, with only the fixture session ID changed.
// The actual producer owns reason:undefined on this enabled arm; callable wire
// encoding emits null. These tests keep the real exported service/parser and
// complete mounted component, replacing only Firebase transport I/O.
const enabled = {
  type: 'pdf-escort-wing-launch-view', sessionId: 'pdf-service-session', turn: 2,
  revision: 1, wingRevision: 0, launched: false, eligible: true, reason: null,
};
const deadline = '9999-12-31T23:59:59.999Z';
// Reuse the existing Station union-test extraction seam, with actual source
// pure helpers here (no server/backend import, allocation or mutation).
const requireFunctions = createRequire(resolve('functions/package.json'));
const { encode: callableEncode } = requireFunctions('./node_modules/firebase-functions/lib/common/providers/https.js') as {
  encode: (value: unknown) => Record<string, unknown>;
};
const tree = ts.createSourceFile('index.ts', readFileSync('functions/src/index.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['isRecord', 'sessionTurn', 'sessionActiveRoleIds', 'wolfAttackActiveVesselIds',
  'wolfFighterLaunchChoiceMap', 'pdfEscortWingLaunchView', 'wolfRangeContactId', 'fighterRangeShiftSource',
  'fighterAceReservedIndex', 'wolfFighterRangeChoiceValue', 'aegisFighterWingCombatStateForAttack', 'wolfFighterRangeActionView'];
const declarations = names.map(name => {
  const node = tree.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  expect(node, `Actual producer ${name}`).toBeDefined(); return node!.getText(tree);
}).join('\n');
const dependencies = { ...fighterCombat, ...fighterCounts, ...rangeMath, parsePdfEscortWingState, authorizeRefineryFighterBayLaunch, emptyMaintenanceCycle,
  turnPhaseState, recommendedRoleIds, isResourceShipId, isCanonicalRequestId,
  WOLF_FIGHTER_LAUNCH_SOURCE_IDS: ['fighter-wing-alpha', 'fighter-wing-bravo', 'pdf-escort-fighter-wing', 'maliades'],
  commandError: (_code: string, message: string) => Error(message) };
const producers = new Function(...Object.keys(dependencies), ts.transpileModule(declarations, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText + '\nreturn { pdfEscortWingLaunchView, wolfFighterRangeActionView, fighterAceReservedIndex, wolfRangeContactId };')(...Object.values(dependencies)) as
  Record<string, (...args: unknown[]) => Record<string, unknown>>;
const produce = producers.pdfEscortWingLaunchView!;
function producerView(blocker?: string) {
  const session = { phase: 'active', currentTurn: 2, activeRoleIds: recommendedRoleIds(15),
    activeVesselIds: ['aegis', 'dione', 'icebreaker', 'quellon', 'refinery-124', 'shepherd'],
    turnPhase: { turn: 2, progression: 'manual', teamPhaseEndsAt: deadline, openAirspaceEndsAt: deadline,
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    maintenanceCycles: { 'refinery-124': { step: 0, revision: 8, turn: 2,
      results: { '5': 'Reactor powered up.', '7': 'Maintenance cycle complete.' },
      completedAt: '2026-10-08T23:31:00.000Z', charges: blocker === 'uncharged' ? [] : ['fighter-bay'], refuelled: [] } },
    shipDamage: { 'refinery-124': { destroyed: blocker === 'destroyed', damagedSystemIds: blocker === 'damaged' ? ['fighter-bay'] : [] } } };
  const attack = { type: 'wolf-attack-state', status: 'declared', currentStep: 'targeting',
    attackId: 'original-attack', turn: 2, revision: 1, airspaceLocked: true,
    battleTableCraftActions: [{ craftId: 'pdf-escort-fighter-wing', kind: 'fighter-wing', ownerRoleId: 'refinery-124-pdf-colonel' }],
    launchedCraftIds: blocker === 'launched' ? ['pdf-escort-fighter-wing'] : [],
    fighterLaunchChoices: ['passed', 'unavailable', 'launched'].includes(blocker ?? '') ? {
      'pdf-escort-fighter-wing': { sourceId: 'pdf-escort-fighter-wing', status: blocker, turn: 2,
        attackId: 'original-attack', revision: 1, actorUid: 'original-pdf', actorRoleId: 'refinery-124-pdf-colonel',
        requestId: '66666666-6666-4666-8666-666666666666' } } : {} };
  const pdf = { ...beginPdfEscortWingAttack(initialPdfEscortWingState(), {
    expectedRevision: 0, attackId: 'original-attack', attackCycle: 2 }),
    ...(blocker === 'no-fighters' ? { revision: 1, fighters: 0, losses: 4 } : {}),
    ...(blocker === 'launched' ? { revision: 1, launched: true } : {}) };
  const document = (value: unknown) => ({ exists: true, get: (key: string) => (value as Record<string, unknown>)[key], data: () => value });
  return produce(enabled.sessionId, document(session), document(attack), document(pdf));
}

const colonel: Player = {
  uid: 'original-pdf', sessionId: enabled.sessionId, displayName: 'PDF Colonel', role: 'player',
  connected: true, connectionGeneration: 1, seatId: 'refinery-124-pdf-colonel',
  assignedRoleId: 'refinery-124-pdf-colonel', activeConsoleRoleId: 'refinery-124-pdf-colonel',
  replacementRoleId: null, replacementStatus: null, fleetGroupId: 'fleet-1',
  joinedAt: '2026-10-08T23:25:00.000Z',
};
function ready() {
  const session = {
    id: enabled.sessionId, name: 'PDF parser bridge', joinCode: '4821', phase: 'active', currentTurn: 2,
    createdAt: '2026-10-08T23:24:52.053Z', updatedAt: '2026-10-08T23:31:11.279Z',
    fullGameDemo: { status: 'active', progression: 'manual' },
    memberSessionScope: { groupId: 'fleet-1', vesselIds: ['refinery-124'], craftIds: [] },
    currentActorBerthAuthority: { sessionId: enabled.sessionId, actorUid: colonel.uid, groupId: 'fleet-1', role: 'player',
      connectionGeneration: 1, assignedRoleId: colonel.assignedRoleId, activeConsoleRoleId: colonel.activeConsoleRoleId,
      replacementRoleId: null, replacementStatus: null, shipId: 'refinery-124' },
    playerDiscovery: { groupId: 'fleet-1', shipId: 'refinery-124', revision: 1, fleetGroupVesselIds: ['refinery-124'],
      knownCoordinates: [], knownSystems: {}, navigationLogs: [], pursuitDistance: 0 },
    turnState: { currentTurn: 2, maxTurn: 6, phase: 'team', phaseRevision: 5, startedAt: deadline, endsAt: deadline },
    turnPhase: { turn: 2, progression: 'manual', teamPhaseEndsAt: deadline, openAirspaceEndsAt: deadline,
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
  } as GameSession;
  useSessionStore.getState().setIdentity(session, colonel);
  useSessionStore.setState({ seats: [{ id: colonel.seatId, roleId: colonel.assignedRoleId, status: 'claimed', holderUid: colonel.uid }] as never });
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  expect(acceptServerSessionAuthority(sessionSnapshotAuthorityFor(session.id, colonel.uid), session, undefined, false, true)).toBe(true);
  return session;
}
function launchPanel() { return screen.getByLabelText('PDF Escort Wing launch control'); }
function mutationCalls() { return io.call.mock.calls.filter(([name]) =>
  name === 'launchPdfEscortWing' || name === 'passWolfFighterLaunchChoice'); }
function source(reply: unknown = callableEncode(producerView()), disposition = 'committed') {
  io.call.mockImplementation(async (name: string, payload: Record<string, unknown>) => {
    if (name === 'readFleetGroupMessages') return { data: { groupId: 'fleet-1', messages: [] } };
    if (name === 'getPdfEscortWingLaunch') return { data: structuredClone(reply) };
    if (name === 'launchPdfEscortWing') return { data: {
      ...enabled, status: disposition, requestId: payload.requestId,
      revision: 2, wingRevision: 1, launched: true, eligible: false,
      choiceStatus: 'launched', reason: 'already-launched',
    } };
    if (name === 'passWolfFighterLaunchChoice') return { data: {
      status: 'committed', type: 'wolf-fighter-launch-choice', sessionId: enabled.sessionId,
      requestId: payload.requestId, attackId: 'original-attack', sourceId: 'pdf-escort-fighter-wing',
      turn: 2, revision: 2, choiceStatus: 'passed',
    } };
    throw new Error(`Unexpected transport ${name}`);
  });
}

// Limited DOM adapter for the unchanged native dispatcher. Every text, enabled
// state and click comes from the actual mounted React control. Authority/GM
// documents remain controlled source fixtures; no native geometry is claimed.
async function dispatchMountedPdf() {
  const user = userEvent.setup();
  const node = (element: HTMLElement | null) => ({
    isVisible: async () => element?.isConnected === true,
    isEnabled: async () => element instanceof HTMLButtonElement && !element.disabled,
    innerText: async () => element?.textContent ?? '',
    getByRole: (role: 'button', options: { name: string }) => node(element ? within(element).queryByRole(role, { name: options.name }) : null),
    click: async () => { expect(element).not.toBeNull(); await user.click(element!); },
  });
  const deps = { firebase: { auth: () => io.auth }, profile: { activeDemoActorProfile: null },
    store: { useSessionStore }, authority: sdkAuthority };
  const page = {
    url: () => 'http://127.0.0.1/ships/refinery-124/roles/refinery-124-pdf-colonel',
    locator: (selector: string) => node(document.querySelector<HTMLElement>(selector)),
    evaluate: async (callback: (...args: unknown[]) => unknown, args: unknown) => {
      const code = callback.toString().replaceAll('__vite_ssr_dynamic_import__', 'import')
        .replace(/await import\(["']\/src\/lib\/firebase\.ts["']\)/g, 'deps.firebase')
        .replace(/await import\(["']\/src\/lib\/demoActorContext\.ts["']\)/g, 'deps.profile')
        .replaceAll("await import('/src/lib/firebase.ts')", 'deps.firebase')
        .replaceAll("await import('/src/lib/demoActorContext.ts')", 'deps.profile')
        .replace(/await import\(\(0,__vite_ssr_import_\d+__\.injectQuery\)\(moduleUrl, ['"]import['"]\)\)/g, 'deps.store')
        .replace(/await import\(\(0,__vite_ssr_import_\d+__\.injectQuery\)\(authorityModuleUrl, ['"]import['"]\)\)/g, 'deps.authority')
        .replaceAll('await import(moduleUrl)', 'deps.store')
        .replaceAll('await import(authorityModuleUrl)', 'deps.authority');
      expect(code).not.toMatch(/await import\(/);
      return new Function('deps', 'args', 'crypto', 'TextEncoder', `return (${code})(args);`)(deps, args, webcrypto, TextEncoder);
    },
  };
  const runner = readFileSync('scripts/pc10-fresh-minimum-ring-proof.mjs', 'utf8');
  const start = runner.indexOf('    async function observe() {'), end = runner.indexOf('    async function until(', start);
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const observe = new Function('page', 'storeUrl', runner.slice(start, end) + ' return observe;')(page, '/src/store/useSessionStore.ts');
  const surface = { label: 'refinery-124-pdf-colonel', page, observe,
    storeModuleUrl: () => '/src/store/useSessionStore.ts', sessionAuthorityModuleUrl: () => '/src/lib/sessionSnapshotAuthority.ts',
    callable: async (endpoint: string, payload: Record<string, unknown>) => {
      const reply = await io.call(endpoint, payload); return { status: 'committed', result: reply.data };
    } };
  const readMember = () => observeFullGameDemoPresentationMember(surface, { knownRoleIds: ['refinery-124-pdf-colonel'] });
  const original = await readMember();
  const assertActor = async () => {
    const current = await readMember();
    expect(current.invalidFields).toEqual([]);
    for (const key of ['hasAuth', 'sameActor', 'currentOwnPlayerConfirmed', 'memberScopeMatches',
      'currentCanonicalSeatOwned', 'currentMemberBerthPresent', 'currentMemberBerthMatches', 'sdkHasServerAuthority']) expect(current[key], key).toBe(true);
    expect(current.sdkResumePending).toBe(false);
    for (const key of ['uidHash', 'sessionId', 'meSessionId', 'profileRoleId', 'profileSessionId', 'playerRole',
      'assignedRoleId', 'activeConsoleRoleId', 'seatId', 'fleetGroupId', 'replacementRoleId', 'replacementStatus',
      'connectionGeneration', 'identityHydrationRevision', 'documentTimeOrigin', 'cycle', 'phase']) expect(current[key], key).toEqual(original[key]);
    expect(current.connection).toBe('live'); expect(current.freshness).toBe('server'); return current;
  };
  const gmAuthority = { sessionId: enabled.sessionId, uidHash: 'controlled-original-gm', generation: 1,
    hydrationRevision: 1, instanceId: 'controlled-gm-lease', claimedAt: '2026-10-08T23:25:14.390Z' };
  const current = { attackId: 'original-attack', turn: 2, revision: 1, threatSiteCode: 'P', targetGroupId: 'fleet-1',
    threatSourceId: 'original-p-arrival', status: 'declared', currentStep: 'targeting', airspaceLocked: true };
  const transport = io.call.getMockImplementation()!;
  const captured: Array<{ endpoint: string; data: unknown; result: unknown }> = [];
  io.call.mockImplementation(async (name: string, payload: Record<string, unknown>) => {
    const reply = await transport(name, payload);
    if (name === 'launchPdfEscortWing' || name === 'passWolfFighterLaunchChoice') captured.push({ endpoint: name, data: payload, result: reply.data });
    return reply;
  });
  const result = await dispatchStationCrewChoice(current, {
    actors: [{ roleId: surface.label, surface }], sessionId: enabled.sessionId, deadlineAt: Date.now() + 1200,
    gmAuthority, assertActor, readAttack: async () => structuredClone(current),
    readTurnState: async () => ({ sessionId: enabled.sessionId, gmAuthority,
      session: { ...useSessionStore.getState().session, turnLimit: 6 } }),
    action: async (_surface: unknown, endpoint: string, choose: () => Promise<void>) => {
      const before = captured.length; await choose();
      await waitFor(() => expect(captured.length).toBe(before + 1));
      expect(captured[before]!.endpoint).toBe(endpoint); return captured[before];
    },
  });
  return { result, captured };
}

beforeEach(() => {
  useSessionStore.getState().reset(); io.call.mockReset(); io.subscribe.mockReset();
  io.auth.currentUser = { uid: colonel.uid };
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  ready();
});

describe('normal PDF callable -> actual service -> mounted launch control', () => {
  it('joins actual producer -> installed encode -> dispatcher -> actual SDK -> mounted control -> normal captured Launch', async () => {
    source(); render(<PdfEscortWingReference writable />);
    const { result, captured } = await dispatchMountedPdf();
    expect(result).toEqual({ committed: true });
    expect(captured).toEqual([{ endpoint: 'launchPdfEscortWing', data: {
      sessionId: enabled.sessionId, requestId: expect.any(String), expectedTurn: 2, expectedRevision: 1, expectedWingRevision: 0,
    }, result: expect.objectContaining({ status: 'committed', choiceStatus: 'launched', reason: 'already-launched' }) }]);
    expect(mutationCalls()).toHaveLength(1);
    expect(within(launchPanel()).getByRole('button', { name: 'PDF Escort Wing launched' })).toBeDisabled();
  });
  it.each(['actual producer and installed encoder', 'retained native DTO shape'])('accepts %s through the actual exported getter', async kind => {
    source(kind === 'retained native DTO shape' ? enabled : callableEncode(producerView()));
    const view = await getPdfEscortWingLaunch();
    expect(view).toEqual({ ...enabled, reason: undefined });
    expect(Object.hasOwn(view!, 'reason')).toBe(false);
    expect(io.call).toHaveBeenCalledWith('getPdfEscortWingLaunch', { sessionId: enabled.sessionId });
    expect(mutationCalls()).toEqual([]);
  });

  it.each(['committed', 'replayed'])('paints enabled-null authority and captures the normal %s launch receipt', async disposition => {
    source(callableEncode(producerView()), disposition);
    const user = userEvent.setup(); render(<PdfEscortWingReference writable />);
    const panel = within(launchPanel());
    const launch = panel.getByRole('button', { name: 'Launch PDF Escort Wing' });
    await waitFor(() => expect(launch).toBeEnabled());
    expect(panel.getByText(/charged and operational/)).toBeVisible();
    expect(panel.queryByRole('alert')).not.toBeInTheDocument();
    expect(mutationCalls()).toEqual([]);
    await user.click(launch);
    await panel.findByRole('button', { name: 'PDF Escort Wing launched' });
    expect(mutationCalls()).toEqual([['launchPdfEscortWing', {
      sessionId: enabled.sessionId, requestId: expect.any(String),
      expectedTurn: 2, expectedRevision: 1, expectedWingRevision: 0,
    }]]);
    expect(panel.queryByRole('button', { name: 'Pass PDF Escort Wing' })).not.toBeInTheDocument();
  });

  it('uses the current displayed revisions for the normal pass after enabled-null read', async () => {
    source();
    const user = userEvent.setup(); render(<PdfEscortWingReference writable />);
    const pass = await within(launchPanel()).findByRole('button', { name: 'Pass PDF Escort Wing' });
    // The normal follow-up getter must supply the actual settled producer arm.
    io.call.mockImplementation(async (name: string, payload: Record<string, unknown>) => {
      if (name === 'readFleetGroupMessages') return { data: { groupId: 'fleet-1', messages: [] } };
      if (name === 'getPdfEscortWingLaunch') return { data: {
        ...enabled, revision: 2, eligible: false, choiceStatus: 'passed', reason: 'passed',
      } };
      expect(name).toBe('passWolfFighterLaunchChoice');
      return { data: { status: 'committed', type: 'wolf-fighter-launch-choice', sessionId: enabled.sessionId,
        requestId: payload.requestId, attackId: 'original-attack', sourceId: 'pdf-escort-fighter-wing',
        turn: 2, revision: 2, choiceStatus: 'passed' } };
    });
    await user.click(pass);
    await within(launchPanel()).findByText('Launch choice passed for this attack.');
    expect(mutationCalls()).toEqual([['passWolfFighterLaunchChoice', {
      sessionId: enabled.sessionId, requestId: expect.any(String), sourceId: 'pdf-escort-fighter-wing',
      expectedTurn: 2, expectedRevision: 1, expectedWingRevision: 0,
    }]]);
    expect(within(launchPanel()).getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
  });

  it.each([
    ['omitted reason', {}], ['own undefined reason', { reason: undefined }],
  ])('preserves the actual enabled producer with %s', async (_label, reason) => {
    const omitted: Record<string, unknown> = { ...enabled }; delete omitted.reason;
    source({ ...omitted, ...reason });
    render(<PdfEscortWingReference writable />);
    await waitFor(() => expect(within(launchPanel()).getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeEnabled());
    expect(mutationCalls()).toEqual([]);
  });

  it('executes the own-undefined producer and installed encoder before the product boundary', () => {
    const raw = producerView();
    expect(Object.hasOwn(raw, 'reason')).toBe(true); expect(raw.reason).toBeUndefined();
    expect(Object.hasOwn(raw, 'choiceStatus')).toBe(false);
    expect(callableEncode(raw)).toEqual(enabled);
  });

  it.each(['passed', 'unavailable', 'launched', 'no-fighters', 'uncharged', 'damaged', 'destroyed'])(
    'keeps the real serialized %s producer arm disabled through the mounted service', async blocker => {
      const raw = callableEncode(producerView(blocker)); source(raw);
      await expect(getPdfEscortWingLaunch()).resolves.toMatchObject({ eligible: false });
      render(<PdfEscortWingReference writable />);
      await waitFor(() => expect(within(launchPanel()).getByRole('button')).toHaveAccessibleDescription(
        blocker === 'launched' ? /Launched/ : blocker === 'passed' ? /passed/ : blocker === 'unavailable' ? /could not launch/ : /denied/,
      ));
      expect(within(launchPanel()).getByRole('button')).toBeDisabled();
      expect(within(launchPanel()).queryByRole('button', { name: 'Pass PDF Escort Wing' })).not.toBeInTheDocument();
      expect(mutationCalls()).toEqual([]);
    },
  );

  const invalid = [
    ['null blocked', { eligible: false }], ['null launched', { eligible: false, launched: true, choiceStatus: 'launched' }],
    ['null passed', { eligible: false, choiceStatus: 'passed' }], ['null unavailable', { eligible: false, choiceStatus: 'unavailable' }],
    ['eligible and launched', { launched: true }], ['eligible passed', { choiceStatus: 'passed' }],
    ['eligible unavailable', { choiceStatus: 'unavailable' }], ['eligible launched status', { choiceStatus: 'launched' }],
    ['eligible omitted reason but passed status', { reason: undefined, choiceStatus: 'passed' }],
    ['unknown reason', { reason: 'invented' }], ['unknown status', { choiceStatus: 'invented' }],
    ['foreign session', { sessionId: 'foreign' }], ['wrong type', { type: 'not-a-launch-view' }],
    ['missing eligible', { eligible: undefined }], ['missing launched', { launched: undefined }],
    ['string revision', { revision: '1' }], ['missing wing revision', { wingRevision: undefined }],
    ['malformed turn', { turn: 0 }],
  ] as const;
  it.each(invalid)('rejects %s through the getter and mounted consumer before any click', async (_label, patch) => {
    source({ ...enabled, ...patch });
    await expect(getPdfEscortWingLaunch()).rejects.toThrow('The server returned an invalid Escort Wing launch view.');
    render(<PdfEscortWingReference writable />);
    await within(launchPanel()).findByRole('alert');
    const panel = within(launchPanel());
    expect(panel.getByRole('alert')).toHaveTextContent('The server returned an invalid Escort Wing launch view.');
    expect(panel.getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
    expect(panel.queryByRole('button', { name: 'Pass PDF Escort Wing' })).not.toBeInTheDocument();
    expect(mutationCalls()).toEqual([]);
  });

  it.each(['uid', 'session', 'role', 'freshness', 'connection', 'accepted server cursor'])(
    'discards an enabled-null read after original %s authority changes during await', async change => {
      let finish!: (value: unknown) => void;
      const delayed = new Promise(resolve => { finish = resolve; });
      source(enabled);
      let sourceReads = 0;
      io.call.mockImplementation(async (name: string) => {
        if (name !== 'getPdfEscortWingLaunch') return { data: { groupId: 'fleet-1', messages: [] } };
        if (++sourceReads === 1) return delayed;
        // A newly mounted UID/scope starts a separate read. It does not get
        // the previous actor's packet or an invented new launch entitlement.
        throw new Error('permission-denied: new source scope has no launch grant');
      });
      render(<PdfEscortWingReference writable />);
      await waitFor(() => expect(io.call.mock.calls.some(([name]) => name === 'getPdfEscortWingLaunch')).toBe(true));
      await act(async () => {
        const state = useSessionStore.getState();
        if (change === 'uid') useSessionStore.setState({ me: { ...colonel, uid: 'foreign-pdf' } });
        if (change === 'session') useSessionStore.getState().setIdentity({ ...state.session!, id: 'foreign' }, { ...colonel, sessionId: 'foreign' });
        if (change === 'role') useSessionStore.setState({ me: { ...colonel, activeConsoleRoleId: 'dione-engineer' } });
        if (change === 'freshness') state.setSessionSnapshotFreshness('cache');
        if (change === 'connection') state.setConnection('offline');
        if (change === 'accepted server cursor') expect(acceptServerSessionAuthority(
          sessionSnapshotAuthorityFor(enabled.sessionId, colonel.uid), { ...state.session!, updatedAt: '2026-10-08T23:31:12.000Z' }, undefined, false, true,
        )).toBe(true);
        finish({ data: structuredClone(enabled) }); await delayed;
      });
      const panel = within(launchPanel());
      expect(panel.getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
      expect(panel.queryByRole('button', { name: 'Pass PDF Escort Wing' })).not.toBeInTheDocument();
      expect(mutationCalls()).toEqual([]);
    },
  );

  it.each(['uid', 'session', 'role', 'freshness', 'connection', 'accepted server cursor'])(
    'returns null from the actual original getter after %s changes during its await', async change => {
      let finish!: (value: unknown) => void;
      const delayed = new Promise(resolve => { finish = resolve; });
      io.call.mockReturnValue(delayed);
      const originalRead = getPdfEscortWingLaunch();
      await waitFor(() => expect(io.call).toHaveBeenCalledTimes(1));
      const state = useSessionStore.getState();
      if (change === 'uid') useSessionStore.setState({ me: { ...colonel, uid: 'foreign-pdf' } });
      if (change === 'session') state.setIdentity({ ...state.session!, id: 'foreign' }, { ...colonel, sessionId: 'foreign' });
      if (change === 'role') useSessionStore.setState({ me: { ...colonel, activeConsoleRoleId: 'dione-engineer' } });
      if (change === 'freshness') state.setSessionSnapshotFreshness('cache');
      if (change === 'connection') state.setConnection('offline');
      if (change === 'accepted server cursor') expect(acceptServerSessionAuthority(
        sessionSnapshotAuthorityFor(enabled.sessionId, colonel.uid), { ...state.session!, updatedAt: '2026-10-08T23:31:12.000Z' }, undefined, false, true,
      )).toBe(true);
      finish({ data: callableEncode(producerView()) });
      await expect(originalRead).resolves.toBeNull();
      expect(mutationCalls()).toEqual([]);
    },
  );

  it('keeps permission denial fatal and zero intent', async () => {
    source(enabled);
    io.call.mockImplementation(async (name: string) => {
      if (name === 'getPdfEscortWingLaunch') throw new Error('permission-denied: current source revoked');
      return { data: { groupId: 'fleet-1', messages: [] } };
    });
    render(<PdfEscortWingReference writable />);
    await within(launchPanel()).findByRole('alert');
    expect(within(launchPanel()).getByRole('alert')).toHaveTextContent('permission-denied');
    expect(within(launchPanel()).getByRole('button', { name: 'Launch PDF Escort Wing' })).toBeDisabled();
    expect(mutationCalls()).toEqual([]);
  });
});


// Related normal range paths under the fixed seven player roles + original GM.
// The PDF projection below is the unchanged producer's return block; document
// state and contact roster are controlled, with no pdfFighterAceAction. Wing
// uses its full actual view producer and pure combat helpers. This is a bounded
// source bridge, not server authorization/transaction or native battle proof.
const escortStart = readFileSync('functions/src/index.ts', 'utf8').indexOf('export const getWolfEscortRangeActionChoice =');
const escortSource = readFileSync('functions/src/index.ts', 'utf8');
const projectionStart = escortSource.indexOf("    const combatSource = sourceId === 'maliades'", escortStart);
const projectionEnd = escortSource.indexOf('\n  });', projectionStart);
expect(projectionStart).toBeGreaterThan(escortStart); expect(projectionEnd).toBeGreaterThan(projectionStart);
const escortProjection = new Function('sessionId', 'inputs', 'state', 'range', 'choice', 'sourceId', 'attack',
  'wolfRangeFixedTargetInstanceIds', 'wolfTargetNumberForRangeSource', 'wolfRangeContactId', 'fighterAceReservedIndex',
  ts.transpileModule(escortSource.slice(projectionStart, projectionEnd), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText) as (...args: unknown[]) => Record<string, unknown>;
function rangeView(sourceId: 'pdf-escort-fighter-wing' | 'fighter-wing-alpha', range: string, launched: boolean, fighters = 4) {
  const inputs = { turn: 2, revision: 1, roster: [{ instanceId: 'original-wolf', shipId: 'wolf-fighter-wing', target: 'aegis', destroyed: false, damageTaken: 0 }],
    receipt: { ring: ['aegis', 'dione', 'icebreaker', 'quellon', 'refinery-124', 'shepherd'] } };
  const combat = fighterCombat.initialAegisFighterWingAttack({ attackId: 'original-attack', cycle: 2,
    counts: { 'fighter-wing-alpha': fighters, 'fighter-wing-bravo': 6 } });
  const state = { attackId: 'original-attack', turn: 2, fighterRangeChoices: {},
    aegisFighterWingState: { ...combat, wings: { ...combat.wings, 'fighter-wing-alpha': { ...combat.wings['fighter-wing-alpha'], launched } } } };
  const doc = { get: (key: string) => (state as Record<string, unknown>)[key] };
  const raw = sourceId === 'fighter-wing-alpha' ? producers.wolfFighterRangeActionView!(enabled.sessionId, {}, doc, range, inputs, sourceId)
    : escortProjection(enabled.sessionId, inputs, { attackId: 'original-attack', launched, pdf: { fighters } }, range, undefined,
      sourceId, doc, rangeMath.wolfRangeFixedTargetInstanceIds, rangeMath.wolfTargetNumberForRangeSource,
      producers.wolfRangeContactId, producers.fighterAceReservedIndex);
  return callableEncode(raw);
}
for (const sourceId of ['pdf-escort-fighter-wing', 'fighter-wing-alpha'] as const) {
  for (const range of ['medium-range', 'short-range'] as const) {
    it.each([true, false])(`actual serialized ${sourceId} ${range} launched=%s reaches its real service and mounted range control`, async launched => {
      if (sourceId === 'fighter-wing-alpha') useSessionStore.setState({ me: { ...colonel,
        assignedRoleId: 'wing-commander', seatId: 'wing-commander', activeConsoleRoleId: 'wing-commander' } });
      const raw = rangeView(sourceId, range, launched);
      expect(raw.launched).toBe(launched); expect(Array.isArray(raw.fighters)).toBe(true);
      let publish!: (view: WolfAttackMemberView) => void;
      io.subscribe.mockImplementation((_sid: string, callback: typeof publish) => { publish = callback; return vi.fn(); });
      io.call.mockImplementation(async (name: string, payload: Record<string, unknown>) => {
        if (name === 'getWolfEscortRangeActionChoice' || name === 'getWolfFighterRangeActionChoice') return { data: raw };
        const common = { status: 'committed', sessionId: enabled.sessionId, requestId: payload.requestId,
          turn: 2, revision: 2, range, choiceStatus: 'pending-resolution', actionCount: 0 };
        if (name === 'commitWolfEscortRangeActionChoice') return { data: { ...common,
          type: 'wolf-escort-range-action-choice', attackId: 'original-attack', sourceId } };
        expect(name).toBe('commitWolfFighterRangeActionChoice');
        return { data: { ...common, type: 'wolf-fighter-range-action-choice', wingId: sourceId, selectedFighterIndexes: [] } };
      });
      render(sourceId === 'pdf-escort-fighter-wing' ? <WolfEscortRangeActionPanel sourceId={sourceId} range={range} />
        : <WolfFighterRangeActionPanel sourceId={sourceId} range={range} />);
      act(() => publish({ type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: enabled.sessionId,
        attackId: 'original-attack', turn: 2, revision: 1, status: 'declared', phase: 'active', currentStep: range,
        range: range === 'medium-range' ? 'medium' : 'short', deadlineAt: deadline, serverTime: deadline,
        visibility: 'members', results: [], redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'] }));
      const name = range === 'medium-range' ? 'Pass Medium Range' : 'Pass Short Range';
      if (launched) {
        const pass = await screen.findByRole('button', { name }); expect(pass).toBeEnabled();
        await userEvent.click(pass);
        await waitFor(() => expect(io.call.mock.calls.filter(([endpoint]) => String(endpoint).startsWith('commitWolf'))).toHaveLength(1));
        const payload = io.call.mock.calls.find(([endpoint]) => String(endpoint).startsWith('commitWolf'))![1];
        expect(payload).toMatchObject({ sessionId: enabled.sessionId, expectedTurn: 2, expectedRevision: 1,
          ...(range === 'medium-range' ? { actions: [] } : { fighterIndexes: [] }) });
      } else {
        await screen.findByText('This wing did not launch for the current attack.');
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
        expect(io.call.mock.calls.filter(([endpoint]) => String(endpoint).startsWith('commitWolf'))).toEqual([]);
      }
    });
  }
}
