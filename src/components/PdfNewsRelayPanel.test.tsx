import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import { pdfNewsRelayDraftKey } from '@/lib/pdfNewsRelayDraft';
import PdfNewsRelayPanel from './PdfNewsRelayPanel';

const mocks = vi.hoisted(() => ({ createActions: vi.fn(), relay: vi.fn() }));
vi.mock('@/lib/fleetGroupService', () => ({ createCurrentFleetGroupActions: mocks.createActions }));

const COLONEL = 'refinery-124-pdf-colonel';
const DRAFT_KEY = pdfNewsRelayDraftKey('s1', 'colonel', 'fleet-2');

function seed(sessionPatch: Record<string, unknown> = {}, mePatch: Record<string, unknown> = {}): void {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    { id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', currentTurn: 2, pressEnabled: true,
      createdAt: '2026-11-05T00:00:00.000Z', updatedAt: '2026-11-05T00:00:00.000Z', ...sessionPatch } as never,
    { uid: 'colonel', sessionId: 's1', displayName: 'PDF Colonel', role: 'player',
      seatId: COLONEL, assignedRoleId: COLONEL, activeConsoleRoleId: COLONEL, fleetGroupId: 'fleet-2',
      joinedAt: '2026-11-05T00:00:00.000Z', ...mePatch } as never,
  );
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  sessionStorage.clear();
  mocks.relay.mockReset().mockImplementation(async (_text: string, handToPress: boolean) => ({
    status: 'committed', groupId: 'fleet-2', messageId: 'relay-1', handedToPress: handToPress,
  }));
  mocks.createActions.mockReset().mockReturnValue({ relayPdfNews: mocks.relay });
  seed();
});

it('relays to the current group only, with the Press hand-off off by default', async () => {
  const user = userEvent.setup();
  render(<PdfNewsRelayPanel enabled />);

  const panel = screen.getByRole('region', { name: 'P.D.F. Colonel news relay' });
  const handOff = screen.getByRole('checkbox', { name: 'Also hand to the Press' });
  expect(handOff).not.toBeChecked();
  await user.type(screen.getByRole('textbox', { name: 'News for your current fleet group' }), 'Outer marker clear.');
  await user.click(screen.getByRole('button', { name: 'Relay to current fleet group' }));

  expect(mocks.relay).toHaveBeenCalledWith('Outer marker clear.', false);
  expect(await screen.findByRole('status')).toHaveTextContent('Relayed to fleet-2. Not handed to the Press.');
  expect(screen.getByRole('textbox', { name: 'News for your current fleet group' })).toHaveValue('');
  expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull();
  expect(panel).toBeVisible();
});

it('hands only this relay to the Press when the Colonel explicitly chooses it, then resets the choice', async () => {
  const user = userEvent.setup();
  render(<PdfNewsRelayPanel enabled />);

  await user.type(screen.getByRole('textbox', { name: 'News for your current fleet group' }), 'Convoy re-forming.');
  await user.click(screen.getByRole('checkbox', { name: 'Also hand to the Press' }));
  await user.click(screen.getByRole('button', { name: 'Relay to current fleet group' }));

  expect(mocks.relay).toHaveBeenCalledWith('Convoy re-forming.', true);
  expect(await screen.findByRole('status'))
    .toHaveTextContent('Relayed to fleet-2. Handed to the Press; the Press decides whether to publish it.');
  expect(screen.getByRole('checkbox', { name: 'Also hand to the Press' })).not.toBeChecked();
});

it('hides the Press hand-off while the Press is not enabled', async () => {
  const user = userEvent.setup();
  seed({ pressEnabled: false });
  render(<PdfNewsRelayPanel enabled />);

  expect(screen.queryByRole('checkbox', { name: 'Also hand to the Press' })).not.toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: 'News for your current fleet group' }), 'Hold position.');
  await user.click(screen.getByRole('button', { name: 'Relay to current fleet group' }));
  expect(mocks.relay).toHaveBeenCalledWith('Hold position.', false);
});

it('keeps an unsent draft in this tab across a remount and after a rejected relay', async () => {
  const user = userEvent.setup();
  const { unmount } = render(<PdfNewsRelayPanel enabled />);
  await user.type(screen.getByRole('textbox', { name: 'News for your current fleet group' }), 'Draft before reselect.');
  expect(sessionStorage.getItem(DRAFT_KEY)).toBe('Draft before reselect.');
  unmount();

  render(<PdfNewsRelayPanel enabled />);
  expect(screen.getByRole('textbox', { name: 'News for your current fleet group' })).toHaveValue('Draft before reselect.');
  mocks.relay.mockRejectedValueOnce(new Error('P.D.F. news relays wait until the Wolf attack is resolved.'));
  await user.click(screen.getByRole('button', { name: 'Relay to current fleet group' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('wait until the Wolf attack is resolved');
  expect(screen.getByRole('textbox', { name: 'News for your current fleet group' })).toHaveValue('Draft before reselect.');
});

it('does not show another group’s draft after the Colonel moves to a different fleet group', async () => {
  sessionStorage.setItem(DRAFT_KEY, 'Only for fleet-2.');
  seed({}, { fleetGroupId: 'fleet-3' });
  render(<PdfNewsRelayPanel enabled />);

  expect(screen.getByRole('textbox', { name: 'News for your current fleet group' })).toHaveValue('');
  expect(sessionStorage.getItem(DRAFT_KEY)).toBe('Only for fleet-2.');
});

it('does not relay while the connection or server snapshot is stale', () => {
  useSessionStore.getState().setConnection('offline');
  render(<PdfNewsRelayPanel enabled />);

  expect(screen.getByRole('status')).toHaveTextContent(/reconnect/i);
  expect(screen.getByRole('button', { name: 'Relay to current fleet group' })).toBeDisabled();
  expect(mocks.relay).not.toHaveBeenCalled();
});

it.each([
  ['another Refinery role', { activeConsoleRoleId: 'refinery-124-engineer' }],
  ['a GM', { role: 'gm' }],
  ['a player without a current fleet group', { fleetGroupId: undefined }],
])('renders nothing for %s', async (_label, patch) => {
  seed({}, patch);
  render(<PdfNewsRelayPanel enabled />);
  await waitFor(() => expect(screen.queryByRole('region', { name: 'P.D.F. Colonel news relay' })).not.toBeInTheDocument());
});
