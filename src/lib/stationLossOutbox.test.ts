// PC10.3 T2.1 (#252) review repair: queued commands across a reconnect that
// reports, or follows, a station loss. Receipt-backed commands are replayed so
// the server re-authorizes them (a refused replay writes nothing), and nothing
// in the outbox flush may replace the reselect instruction: a command that is
// not sent or is refused is reported inside that notice instead.
import { render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import CommunicationError from '@/components/CommunicationError';
import {
  returningScientist, scientistSession, STATION_LOSS_NOTICE, stationLostResumeReply,
} from '@/test/stationLossReconnect';

const server = vi.hoisted(() => ({
  calls: [] as { name: string; data: Record<string, unknown> }[],
  handlers: {} as Record<string, (data: Record<string, unknown>) => unknown>,
}));

vi.mock('firebase/auth', () => ({ signInAnonymously: vi.fn().mockResolvedValue(undefined) }));
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((_functions: unknown, name: string) => async (data: Record<string, unknown>) => {
    server.calls.push({ name, data });
    const handler = server.handlers[name];
    if (!handler) throw new Error(`Unexpected callable ${name}`);
    return { data: await handler(data) };
  }),
}));
vi.mock('./firebase', () => ({
  auth: () => ({ currentUser: { uid: 'u1' } }),
  functions: vi.fn(() => ({ kind: 'functions' })),
}));

const { connectAutomatically } = await import('./sessionService');

let clock = Date.parse('2026-09-12T00:10:00.000Z');
const newer = <T extends { session: object }>(reply: T): T => {
  clock += 1_000;
  return { ...reply, session: { ...reply.session, updatedAt: new Date(clock).toISOString() } };
};
const lostPlayer = { ...returningScientist, seatId: null, activeConsoleRoleId: null };
const NOT_SENT = 'A queued action from before the change was not completed. Review the live state before retrying.';

function grievance(id: string, ageMs: number) {
  return {
    id, kind: 'submitCivilUnrestGrievance' as const,
    payload: { sessionId: 's1', requestId: `req-${id}`, crisisId: 'unrest-1', expectedCrisisRevision: 2,
      expectedGrievanceRevision: 0, affectedShipId: 'shepherd', visibility: 'private' as const, text: `text ${id}` },
    createdAt: new Date(Date.now() - ageMs).toISOString(), queuedWithServerAuthority: true as const,
  };
}
const grievanceCalls = () => server.calls.filter(({ name }) => name === 'submitCivilUnrestGrievance');

/** The notice the player sees: the reselect instruction, plus the not-completed sentence exactly once when reported. */
function expectRenderedNotice({ notCompleted }: { notCompleted: boolean }) {
  render(createElement(CommunicationError));
  const alert = screen.getByRole('alert');
  expect(alert).toHaveTextContent(STATION_LOSS_NOTICE);
  expect((alert.textContent ?? '').split(NOT_SENT).length - 1).toBe(notCompleted ? 1 : 0);
}

beforeEach(() => {
  server.calls.length = 0;
  server.handlers = {
    resumeSession: () => newer(stationLostResumeReply()),
    // As on the server: the team role (assignedRoleId) still authorizes a grievance after the station is lost.
    submitCivilUnrestGrievance: (data) => ({ status: 'committed', requestId: data.requestId }),
  };
  const state = useSessionStore.getState();
  state.reset();
  state.setIdentity(scientistSession, returningScientist);
  state.setConnection('offline');
});

it('replays a receipt-backed command queued before the loss for the server to re-authorize, keeping the notice', async () => {
  useSessionStore.getState().enqueueCommand(grievance('fresh', 1_000));
  await connectAutomatically();
  const state = useSessionStore.getState();
  expect(grievanceCalls()).toEqual([expect.objectContaining({ data: expect.objectContaining({ requestId: 'req-fresh' }) })]);
  expect(state.pendingCommands).toEqual([]);
  expect(state.communicationError).toMatchObject({ kind: 'station-selection-required', message: STATION_LOSS_NOTICE });
  expectRenderedNotice({ notCompleted: false });
});

it('keeps the reselect instruction when a queued command expired while the member was away, and says it was not sent', async () => {
  useSessionStore.getState().enqueueCommand(grievance('old', 60_000));
  await connectAutomatically();
  const state = useSessionStore.getState();
  expect(grievanceCalls()).toEqual([]);
  expect(state.pendingCommands).toEqual([]);
  expect(state.communicationError).toMatchObject({ kind: 'station-selection-required' });
  expectRenderedNotice({ notCompleted: true });
});

it('keeps the reselect instruction when an expired command precedes a fresh one the server refuses', async () => {
  server.handlers.submitCivilUnrestGrievance = () => {
    throw Object.assign(new Error('refused'), {
      code: 'functions/permission-denied', details: { commandError: 'unauthorized' },
    });
  };
  useSessionStore.getState().enqueueCommand(grievance('old', 60_000));
  useSessionStore.getState().enqueueCommand(grievance('fresh', 1_000));
  await connectAutomatically();
  const state = useSessionStore.getState();
  expect(grievanceCalls().map(({ data }) => data.requestId)).toEqual(['req-fresh']);
  expect(state.pendingCommands).toEqual([]);
  expect(state.communicationError).toMatchObject({ kind: 'station-selection-required' });
  expectRenderedNotice({ notCompleted: true });
  expect(state.me).toMatchObject({ seatId: null, activeConsoleRoleId: null });
});

it('sends a command queued after an earlier loss on a later reconnect that reports no new loss', async () => {
  useSessionStore.getState().setIdentity(scientistSession, lostPlayer);
  useSessionStore.getState().setCommunicationError({
    kind: 'station-selection-required', code: 'permission-denied', message: STATION_LOSS_NOTICE,
  });
  server.handlers.resumeSession = () => newer({ session: scientistSession, player: lostPlayer });
  useSessionStore.getState().enqueueCommand(grievance('after-loss', 1_000));
  await connectAutomatically();
  const state = useSessionStore.getState();
  expect(grievanceCalls().map(({ data }) => data.requestId)).toEqual(['req-after-loss']);
  expect(state.pendingCommands).toEqual([]);
  expect(state.communicationError).toMatchObject({ kind: 'station-selection-required', message: STATION_LOSS_NOTICE });
  expectRenderedNotice({ notCompleted: false });
});
