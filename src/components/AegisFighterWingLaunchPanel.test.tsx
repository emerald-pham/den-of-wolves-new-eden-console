import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authority: vi.fn(),
  getLaunch: vi.fn(),
}));

vi.mock('@/lib/wolfAttackChoiceController', () => ({
  useWolfAttackChoiceAuthority: () => mocks.authority(),
}));
vi.mock('@/lib/sessionService', () => ({
  getAegisFighterWingLaunch: (sourceId: string) => mocks.getLaunch(sourceId),
  launchAegisFighterWing: vi.fn(),
  passWolfFighterLaunchChoice: vi.fn(),
}));
vi.mock('./PdfFighterAcePermissionControl', () => ({
  default: ({ sourceId }: { sourceId: string }) => <div data-testid={`ace-permission-${sourceId}`} />,
}));

import AegisFighterWingLaunchPanel, { AegisFighterWingLaunchPanelView } from './AegisFighterWingLaunchPanel';

const alpha = {
  type: 'aegis-fighter-wing-launch-view', sessionId: 's1', wingId: 'fighter-wing-alpha',
  turn: 1, attackId: 'wolf-1', revision: 4, wingRevision: 0, fighters: 4,
  launched: false, eligible: true,
} as const;
const bravo = {
  ...alpha, wingId: 'fighter-wing-bravo', eligible: false, reason: 'uncharged',
} as const;

it('keeps Alpha and Bravo launch choices independent and explains an uncharged bay', () => {
  const onLaunch = vi.fn();
  render(<AegisFighterWingLaunchPanelView views={{
    'fighter-wing-alpha': alpha,
    'fighter-wing-bravo': bravo,
  }} onLaunch={onLaunch} />);

  expect(screen.getByRole('region', { name: /aegis fighter wing launches/i })).toBeVisible();
  expect(screen.getByText('Fighter Wing Alpha')).toBeVisible();
  expect(screen.getByText('Fighter Wing Bravo')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /launch fighter wing alpha/i }));
  expect(onLaunch).toHaveBeenCalledWith('fighter-wing-alpha', alpha);
  expect(screen.getByRole('button', { name: /launch fighter wing bravo/i })).toBeDisabled();
  expect(screen.getByText(/charge Fighter Bay Bravo/i)).toBeVisible();
});

it('offers an explicit pass for each eligible independent wing choice', () => {
  const onLaunch = vi.fn();
  const onPass = vi.fn();
  render(<AegisFighterWingLaunchPanelView views={{
    'fighter-wing-alpha': alpha,
    'fighter-wing-bravo': bravo,
  }} onLaunch={onLaunch} onPass={onPass} />);

  fireEvent.click(screen.getByRole('button', { name: /pass fighter wing alpha/i }));
  expect(onPass).toHaveBeenCalledWith('fighter-wing-alpha', alpha);
  expect(screen.queryByRole('button', { name: /pass fighter wing bravo/i })).not.toBeInTheDocument();
});

it('mounts source-officer Fighter Ace permission controls for launched AEGIS wings', async () => {
  mocks.authority.mockReturnValue({ sessionId: 's1', actorReady: true, ready: true });
  mocks.getLaunch.mockImplementation(async (wingId: string) => ({
    ...alpha, wingId, launched: true, eligible: false, reason: 'already-launched',
  }));

  render(<AegisFighterWingLaunchPanel />);

  expect(await screen.findByTestId('ace-permission-fighter-wing-alpha')).toBeInTheDocument();
  expect(await screen.findByTestId('ace-permission-fighter-wing-bravo')).toBeInTheDocument();
  expect(mocks.getLaunch).toHaveBeenCalledTimes(2);
});
