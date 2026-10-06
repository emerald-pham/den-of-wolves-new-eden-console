import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import SessionMode from './SessionMode';

const mocks = vi.hoisted(() => ({ submitShipPreference: vi.fn() }));
vi.mock('@/lib/sessionService', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return { ...original, submitShipPreference: mocks.submitShipPreference };
});

function renderRoster() {
  return render(
    <MemoryRouter initialEntries={['/console']}>
      <Routes><Route path="/console" element={<SessionMode mode="console" />} /></Routes>
    </MemoryRouter>,
  );
}

function prepareMember(sessionPatch: Record<string, unknown> = {}, playerPatch: Record<string, unknown> = {}) {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table one', joinCode: '4821', phase: 'casting',
    activeVesselIds: ['aegis', 'dione'], setupRevision: 4, configurationLocked: false,
    pressEnabled: true, ...sessionPatch,
  } as never, {
    uid: 'u1', sessionId: 's1', displayName: 'Crew', role: 'player', seatId: null,
    connected: true, shipPreferenceId: null, ...playerPatch,
  } as never);
  useSessionStore.getState().setMode('console');
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
}

beforeEach(() => {
  mocks.submitShipPreference.mockReset();
  prepareMember();
});

afterEach(() => vi.restoreAllMocks());

it('lets a live member submit an optional nonbinding preference from the exact active vessel roster', async () => {
  const user = userEvent.setup();
  mocks.submitShipPreference.mockResolvedValue({ disposition: 'applied', requestId: 'pref-1' });
  renderRoster();

  const panel = screen.getByRole('region', { name: 'Casting preference' });
  expect(within(panel).getByText(/optional, nonbinding ship preference/i)).toBeVisible();
  expect(within(panel).getByText(/no resources or actions are used/i)).toBeVisible();
  expect(within(panel).getByText(/the GM decides assignments and any tie-breaks/i)).toBeVisible();

  const choice = within(panel).getByRole('combobox', { name: 'Preferred ship' });
  expect(within(choice).getByRole('option', { name: 'AEGIS' })).toBeInTheDocument();
  expect(within(choice).getByRole('option', { name: 'Dione' })).toBeInTheDocument();
  expect(within(choice).queryByRole('option', { name: 'SHEPHERD' })).not.toBeInTheDocument();

  await user.selectOptions(choice, 'dione');
  await user.click(within(panel).getByRole('button', { name: 'Submit preference' }));

  expect(mocks.submitShipPreference).toHaveBeenCalledWith('dione');
  expect(await within(panel).findByRole('status')).toHaveTextContent(/preference confirmed.*GM decides/i);
});

it('blocks the control until the connected player has fresh server state', () => {
  useSessionStore.getState().setConnection('offline');
  useSessionStore.getState().setSessionSnapshotFreshness('cache');
  renderRoster();

  const panel = screen.getByRole('region', { name: 'Casting preference' });
  expect(within(panel).getByRole('combobox', { name: 'Preferred ship' })).toBeDisabled();
  expect(within(panel).getByRole('button', { name: 'Submit preference' })).toBeDisabled();
  expect(within(panel).getByText(/reconnect and wait for current server state/i)).toBeVisible();
  expect(mocks.submitShipPreference).not.toHaveBeenCalled();
});

it('fails closed if the member roster contains a vessel the UI cannot label', () => {
  prepareMember({ activeVesselIds: ['aegis', 'unregistered-vessel'] });
  renderRoster();

  const panel = screen.getByRole('region', { name: 'Casting preference' });
  expect(within(panel).queryByRole('combobox', { name: 'Preferred ship' })).not.toBeInTheDocument();
  expect(within(panel).getByText(/active roster cannot be safely shown/i)).toBeVisible();
  expect(within(panel).queryByRole('button', { name: 'Submit preference' })).not.toBeInTheDocument();
});

it.each([
  ['GM', { role: 'gm' }, { phase: 'casting' }],
  ['active game', { role: 'player' }, { phase: 'active' }],
])('does not offer casting preference controls to %s', (_label, playerPatch, sessionPatch) => {
  prepareMember(sessionPatch, playerPatch);
  renderRoster();
  expect(screen.queryByRole('region', { name: 'Casting preference' })).not.toBeInTheDocument();
});

it('shows the current advisory choice but does not let a GM or assigned roster change through it', () => {
  prepareMember({}, { shipPreferenceId: 'aegis', assignedRoleId: 'admiral' });
  renderRoster();

  const panel = screen.getByRole('region', { name: 'Casting preference' });
  expect(within(panel).getByRole('combobox', { name: 'Preferred ship' })).toHaveValue('aegis');
  expect(within(panel).getByText(/your current preference is AEGIS.*GM decides/i)).toBeVisible();
  expect(within(panel).queryByRole('button', { name: /assign|claim|station|GM/i })).not.toBeInTheDocument();
});
