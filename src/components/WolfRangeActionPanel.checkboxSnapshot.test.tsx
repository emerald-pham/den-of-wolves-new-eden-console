import { readFileSync } from 'node:fs';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { StrictMode, useState } from 'react';
import { aegisWolfRangeActions } from '../../functions/src/wolfAttackLifecycle';
import { wolfRangeLegalTargetInstanceIds } from '../../functions/src/wolfCombatMath';
import { useSessionStore } from '@/store/useSessionStore';
import { acceptServerSessionAuthority, sessionSnapshotAuthorityFor } from '@/lib/sessionSnapshotAuthority';
import { wolfAttackChoiceAuthorityIsCurrent, useWolfAttackChoiceAuthority } from '@/lib/wolfAttackChoiceController';
import type { GameSession, Player, WolfAttackMemberView, WolfRangeActionChoiceView } from '@/types/game';
// @ts-expect-error The unchanged native proof helper has no TypeScript declaration.
import { selectAndCertifyBaseRangeActionControls } from '../../scripts/pc10-base-range-action-controls.mjs';
import WolfRangeActionPanel, { WolfRangeActionPanelView } from './WolfRangeActionPanel';
import { getWolfRangeActionChoice } from '@/lib/sessionService';

const io = vi.hoisted(() => ({ subscribe: vi.fn(), call: vi.fn(), uid: 'original-eo', auth: { currentUser: { uid: 'original-eo' } } }));
vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_instance: unknown, name: string) =>
  (payload: unknown) => io.call(name, payload) }));
vi.mock('@/lib/firebase', () => ({ app: vi.fn(), auth: () => io.auth, functions: () => ({}) }));
vi.mock('@/lib/firestore', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/firestore')>(), subscribeWolfAttackMemberView: io.subscribe,
}));

// Actual server projection and pure weapon/contact policy. Only document and
// Firebase transport I/O are inert; the real service parser/controller/store
// and complete production wrapper receive the resulting public DTO.
const indexSource = ts.createSourceFile('index.ts', readFileSync('functions/src/index.ts', 'utf8'),
  ts.ScriptTarget.Latest, true);
const names = ['isRecord', 'wolfRangeContactId', 'wolfRangeContacts', 'wolfRangeDecisionValue', 'safeWolfRangeLock', 'wolfRangeChoiceView'];
const declarations = names.map(name => {
  const node = indexSource.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  expect(node, `Actual source function ${name}`).toBeDefined();
  return node!.getText(indexSource);
}).join('\n');
const produce = new Function('wolfRangeLegalTargetInstanceIds', 'commandError', 'wolfShipForId',
  `${ts.transpileModule(declarations, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText}\nreturn wolfRangeChoiceView;`)(
  wolfRangeLegalTargetInstanceIds, () => { throw new Error('Malformed native server state.'); },
  () => { throw new Error('No Short Range coverage branch in this Medium fixture.'); },
) as (sid: string, state: { get: (key: string) => unknown }, range: string, inputs: unknown) => WolfRangeActionChoiceView;

const callbacks: Array<(member: WolfAttackMemberView | null) => void> = [];
let number = 0;
const sourceDeadline = '9999-12-31T23:59:59.999Z';

function connectedFixture() {
  const sid = `checkbox-source-${++number}`;
  const player: Player = { uid: io.uid as Player['uid'], sessionId: sid, displayName: 'Executive Officer', role: 'player',
    connected: true, seatId: 'executive-officer', assignedRoleId: 'executive-officer', activeConsoleRoleId: 'executive-officer',
    replacementRoleId: null, replacementStatus: null, fleetGroupId: 'fleet-1' as NonNullable<Player['fleetGroupId']>,
    connectionGeneration: 8, joinedAt: '2026-10-06T00:00:00.000Z' as never };
  const session = { id: sid, phase: 'active', currentTurn: 1,
    turnState: { currentTurn: 1, maxTurn: 6, phase: 'team', phaseRevision: 1, startedAt: sourceDeadline, endsAt: sourceDeadline },
    turnPhase: { turn: 1, progression: 'manual', teamPhaseEndsAt: sourceDeadline, openAirspaceEndsAt: sourceDeadline,
      airspace: { state: 'restricted', tickerActive: true, pressAccess: false } },
    playerDiscovery: { groupId: 'fleet-1', shipId: 'aegis', revision: 1, fleetGroupVesselIds: ['aegis', 'dione'],
      knownCoordinates: [], knownSystems: {}, navigationLogs: [], pursuitDistance: 0 },
  } as unknown as GameSession;
  useSessionStore.getState().setIdentity(session, player);
  useSessionStore.setState({ connection: 'live', sessionSnapshotFreshness: 'server' });
  expect(acceptServerSessionAuthority(sessionSnapshotAuthorityFor(sid, player.uid), session, undefined, false, true)).toBe(true);
  const member: WolfAttackMemberView = { type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: sid, attackId: 'original-attack',
    turn: 1, revision: 17, status: 'declared', phase: 'active', currentStep: 'medium-range', range: 'medium',
    deadlineAt: sourceDeadline, serverTime: sourceDeadline, visibility: 'members', results: [],
    redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'] };
  const actions = aegisWolfRangeActions({ range: 'medium-range', charges: ['missile-launchers', 'point-defence-lasers'],
    damagedSystemIds: [], destroyed: false, upgrades: [] });
  const view = produce(sid, { get: () => undefined }, 'medium-range', { turn: 1, revision: 17, deadlineAt: sourceDeadline, actions,
    roster: [{ instanceId: 'wolf-original', shipId: 'wolf-fighter-wing', target: 'aegis', damageTaken: 0 }] });
  io.call.mockImplementation(async (name: string, payload: unknown) => {
    expect(name).toBe('getWolfRangeActionChoice'); expect(payload).toEqual({ sessionId: sid }); return { data: structuredClone(view) };
  });
  return { session, player, member, view };
}

async function mountFixture() {
  const fixture = connectedFixture();
  let originalAuthorityKey = '';
  function Authority() {
    const current = useWolfAttackChoiceAuthority('executive-officer'); originalAuthorityKey ||= current.key;
    return <span>{current.key === originalAuthorityKey ? 'same original authority' : 'changed authority'}</span>;
  }
  render(<StrictMode><Authority /><WolfRangeActionPanel /></StrictMode>);
  act(() => callbacks.at(-1)?.(fixture.member));
  await screen.findByRole('checkbox', { name: 'Missile launchers' });
  const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[];
  const checks: number[] = [], certificates: Array<Record<string, unknown>> = [];
  const reads: number[] = [];
  const panel = {
    count: async () => screen.queryAllByRole('region', { name: 'Wolf range actions' }).length,
    getByRole: (role: string) => {
      expect(role).toBe('checkbox'); return { all: async () => boxes().map((_box, index) => ({
        check: async () => {
          checks.push(index);
          // A normal member feed callback queues wrapper/controller work in
          // the same native event boundary as the sole original first check.
          await act(async () => {
            if (index === 0) callbacks.at(-1)?.({ ...fixture.member });
            fireEvent.click(boxes()[index]!);
          });
        },
      })) };
    },
    evaluate: async (callback: (element: HTMLElement) => unknown) => {
      reads.push(reads.length + 1); return callback(screen.getByRole('region', { name: 'Wolf range actions' }));
    },
  };
  const deadlineAt = Date.now() + 35_000;
  const checkpoint = async () => {
    expect(wolfAttackChoiceAuthorityIsCurrent('executive-officer', originalAuthorityKey, fixture.session.id)).toBe(true);
    expect(useSessionStore.getState().me).toEqual(fixture.player);
    expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    expect(Date.now()).toBeLessThan(deadlineAt);
  };
  return { ...fixture, boxes, checks, reads, certificates, panel, checkpoint, deadlineAt, originalAuthorityKey };
}

beforeEach(() => {
  callbacks.length = 0; useSessionStore.getState().reset(); io.call.mockReset();
  io.subscribe.mockReset().mockImplementation((_sid: string, callback: (member: WolfAttackMemberView | null) => void) => {
    callbacks.push(callback); return vi.fn();
  });
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function (this: HTMLElement) {
    return (this.isConnected ? [{ width: 100, height: 20 }] : []) as unknown as DOMRectList;
  });
});

it('retains both original Medium action checks through a same-actor member callback and the unchanged two-read certificate', async () => {
  const f = await mountFixture();
  const expected = { sessionId: f.session.id, attackId: f.member.attackId, turn: 1, revision: 17, status: 'declared', currentStep: 'medium-range' };
  const result = await selectAndCertifyBaseRangeActionControls({ panel: f.panel, view: f.view, expected,
    deadlineAt: f.deadlineAt, checkpoint: f.checkpoint, record: (row: Record<string, unknown>) => f.certificates.push(row) });
  expect(result.matched).toBe(true); expect(result.checkedCount).toBe(2); expect(result.formReadCount).toBe(2);
  expect(f.checks).toEqual([0, 1]); expect(f.reads).toEqual([1, 2]);
  expect(f.boxes().map(box => box.checked)).toEqual([true, true]);
  expect(io.call.mock.calls.map(call => call[0])).toEqual(['getWolfRangeActionChoice', 'getWolfRangeActionChoice']);
  expect(f.certificates).toHaveLength(1); expect(result.gameplayCredit).toBe(false);
});

it('snapshots the sole original first checkbox event before a supported deferred functional selection update reads the controlled DOM', async () => {
  const f = connectedFixture();
  const view = await getWolfRangeActionChoice();
  expect(view).toEqual(f.view);
  if (view.type !== 'wolf-range-action-choice-view') throw new Error('The real service must yield the original pending view.');
  let applyFirst!: () => void;
  let updateCount = 0;
  const callbacks = vi.fn();
  function DeferredControlledView() {
    const [actionIds, setActionIds] = useState<readonly string[]>([]);
    return <WolfRangeActionPanelView view={view as WolfRangeActionChoiceView} onUseActions={callbacks}
      onPass={callbacks} onAssignTargets={callbacks} actionSelection={{ actionIds,
        update: change => {
          updateCount++;
          if (updateCount === 1) applyFirst = () => setActionIds(change);
          else setActionIds(change);
        } }} />;
  }
  // This explicit inert scheduling seam exercises the exported controlled
  // view's functional-update contract. It does NOT claim the production
  // wrapper defers this way, nor that Capy6 retained such an event ordering.
  render(<DeferredControlledView />);
  const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[];
  const checks: number[] = [], paints: unknown[] = [], certificates: Record<string, unknown>[] = [];
  const panel = {
    count: async () => screen.queryAllByRole('region', { name: 'Wolf range actions' }).length,
    getByRole: (role: string) => {
      expect(role).toBe('checkbox'); return { all: async () => boxes().map((_box, index) => ({ check: async () => {
        checks.push(index);
        act(() => fireEvent.click(boxes()[index]!));
        if (index === 0) {
          // React itself restores the original controlled DOM value while
          // the functional updater is pending; no fixture edits a checkbox.
          expect(boxes()[0]).not.toBeChecked();
          act(applyFirst);
        }
      } })) };
    },
    evaluate: async (callback: (element: HTMLElement) => unknown) => {
      const value = callback(screen.getByRole('region', { name: 'Wolf range actions' })); paints.push(value); return value;
    },
  };
  const result = await selectAndCertifyBaseRangeActionControls({ panel, view, expected: { sessionId: f.session.id,
    attackId: f.member.attackId, turn: 1, revision: 17, status: 'declared', currentStep: 'medium-range' },
    deadlineAt: Date.now() + 35_000, checkpoint: async () => {
      expect(useSessionStore.getState().me).toEqual(f.player);
      expect(useSessionStore.getState().identityHydrationRevision).toBe(1);
    }, record: (row: Record<string, unknown>) => certificates.push(row) }).catch((cause: unknown) => {
      console.info('Deferred contract certificate (native-only, not historical cause):', JSON.stringify(certificates[0]));
      throw cause;
    });
  expect(result.matched).toBe(true); expect(result.checkedCount).toBe(2); expect(result.formReadCount).toBe(2);
  expect(boxes().map(box => box.checked)).toEqual([true, true]);
  expect(checks).toEqual([0, 1]); expect(paints).toHaveLength(2); expect(updateCount).toBe(2);
  expect(callbacks).not.toHaveBeenCalled(); expect(io.call).toHaveBeenCalledTimes(1);
});
