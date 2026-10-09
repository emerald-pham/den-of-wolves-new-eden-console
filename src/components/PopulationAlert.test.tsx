import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
import type { PopulationAlert as PopulationAlertData } from '@/types/game';
import PopulationAlert from './PopulationAlert';
import attemptEvidence from '../../scripts/fixtures/pc10-population-gm-observer-attempt-evidence.json';

vi.mock('@/lib/sessionService', () => ({ dismissPopulationAlert: vi.fn() }));
const { dismissPopulationAlert } = await import('@/lib/sessionService');

beforeEach(() => {
  vi.mocked(dismissPopulationAlert).mockReset();
  vi.mocked(dismissPopulationAlert).mockResolvedValue(undefined);
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 's1', name: 'Table', joinCode: '4821', phase: 'active', ownerUid: 'u1',
    populationAlerts: {
      capybara: {
        population: 15000, shipId: 'capybara', shipName: 'Capybara', targetGmInstanceIds: ['gm-1'],
        createdAt: '2026-09-05T12:00:00.000Z',
      },
    },
    createdAt: '2026-09-05T00:00:00.000Z', updatedAt: '2026-09-05T00:00:00.000Z',
  }, {
    uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
    joinedAt: '2026-09-05T00:00:00.000Z',
  });
  useSessionStore.getState().setGmInstance({
    id: 'gm-1', sessionId: 's1', uid: 'u1', name: 'Bridge', deviceLabel: 'Test',
    claimedAt: '2026-09-05T00:00:00.000Z',
  });
});

it('blocks an active GM with a fullscreen alert until they dismiss it', async () => {
  const user = userEvent.setup();
  render(<PopulationAlert />);

  const alert = screen.getByRole('alertdialog', { name: /survivor population threshold reached/i });
  expect(alert).toHaveTextContent(/capybara.*15,000/i);
  await user.click(screen.getByRole('button', { name: /dismiss population alert/i }));
  expect(dismissPopulationAlert).toHaveBeenCalledWith('capybara');
});

it('lets the GM retry when acknowledgement cannot reach the server', async () => {
  vi.mocked(dismissPopulationAlert).mockRejectedValueOnce(new Error('offline'));
  const user = userEvent.setup();
  render(<PopulationAlert />);

  const button = screen.getByRole('button', { name: /dismiss population alert/i });
  await user.click(button);
  expect(button).toBeEnabled();
});

function attempt20PopulationAlerts(order: 'server' | 'reverse' = 'server') {
  const alerts = attemptEvidence.attempt20.orderedServerAlerts.map(({ mapKey, ...alert }) => [mapKey, alert] as const);
  const ordered = order === 'reverse' ? [...alerts].reverse() : alerts;
  return Object.fromEntries(ordered.map(([mapKey, alert]) => [mapKey, alert]));
}

function setPopulationView(populationAlerts: Record<string, PopulationAlertData>, gmInstanceId: string, unrestAlerts = {}) {
  const state = useSessionStore.getState();
  useSessionStore.setState({
    session: { ...state.session!, populationAlerts, unrestAlerts },
    gmInstance: { ...state.gmInstance!, id: gmInstanceId },
  });
}

it('renders the source component’s first targeted alert in browser feed order for the Attempt20 server tuples', () => {
  // Attempt20 retained its five ordered server rows but no native dialog or DOM
  // projection. This is a source-rendered control, not a reconstruction of it.
  expect(attemptEvidence.attempt20.nativeDomProjection).toBeNull();
  const firstClientAlert = attemptEvidence.attempt20.orderedServerAlerts.at(-1)!;
  setPopulationView(attempt20PopulationAlerts('reverse'), firstClientAlert.targetGmInstanceIds[0]!);
  render(<PopulationAlert />);

  const dialog = screen.getByRole('alertdialog', { name: 'Survivor population threshold reached' });
  expect(dialog.textContent).toContain(
    `${firstClientAlert.shipName} survivor population has reached ${firstClientAlert.population.toLocaleString('en-US')}. A census threshold requires GM attention.`,
  );
  expect(dialog.textContent).not.toContain('Dione survivor population');
  expect(screen.getByRole('button', { name: 'Dismiss population alert' })).toBeEnabled();
});

it('skips another GM’s alert and suppresses population UI while its unrest alert is pending', () => {
  const alert = attemptEvidence.attempt20.orderedServerAlerts[0]!;
  const gmInstanceId = alert.targetGmInstanceIds[0]!;
  const unrelated = { ...alert, shipId: 'other-ship', shipName: 'Other Ship', targetGmInstanceIds: ['other-gm'] };
  setPopulationView({ unrelated, [alert.shipId]: alert }, gmInstanceId);
  const view = render(<PopulationAlert />);
  expect(screen.getByRole('alertdialog')).toHaveTextContent('Dione survivor population has reached 70,000.');
  view.unmount();

  setPopulationView({ [alert.shipId]: alert }, gmInstanceId, {
    dione: { shipId: 'dione', targetGmInstanceIds: [gmInstanceId] },
  });
  render(<PopulationAlert />);
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('disables the exact population acknowledgment while the normal request is pending', async () => {
  let finishRequest!: () => void;
  vi.mocked(dismissPopulationAlert).mockReturnValueOnce(new Promise<void>(resolve => { finishRequest = resolve; }));
  const user = userEvent.setup();
  render(<PopulationAlert />);

  await user.click(screen.getByRole('button', { name: 'Dismiss population alert' }));
  const acknowledging = await screen.findByRole('button', { name: 'Acknowledging' });
  expect(acknowledging).toBeDisabled();
  finishRequest();
  expect(await screen.findByRole('button', { name: 'Dismiss population alert' })).toBeEnabled();
});
