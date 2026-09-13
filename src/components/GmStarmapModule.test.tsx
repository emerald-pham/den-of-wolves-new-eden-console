import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import type { GameSession } from '@/types/game';
import GmStarmapModule from './GmStarmapModule';
import { STAR_CHART_SYSTEMS as LEGACY_SYSTEMS, siteForCoordinate } from '@/data/starChart';

const ORGANISER_SYSTEMS = Object.fromEntries(LEGACY_SYSTEMS.map((system, index) => [
  `system-${String(index + 1).padStart(2, '0')}`, system.coordinate,
]));
const organiserSitesFor = (chart: 'A' | 'B' | 'C') => Object.fromEntries(LEGACY_SYSTEMS.flatMap((system) => {
  const site = siteForCoordinate(system.coordinate, chart);
  return site ? [[system.coordinate, site]] : [];
}));

vi.mock('@/lib/sessionService', () => ({
  moveShipToLocation: vi.fn().mockResolvedValue({
    shipId: 'aegis', origin: '0000', destination: '5143', stardate: '2026.250.130409',
  }),
}));

const { moveShipToLocation } = await import('@/lib/sessionService');

const session = {
  id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm',
  createdAt: '2026-09-07T00:00:00.000Z', updatedAt: '2026-09-07T00:00:00.000Z',
  currentTurn: 1,
  shipGalacticCoordinates: { aegis: '0000', dione: '0000' },
  shipNavigationLogs: { aegis: [], dione: [] },
  organiserSystems: ORGANISER_SYSTEMS,
  organiserSites: organiserSitesFor('A'),
} as unknown as GameSession;

it('lets the GM select a ship, click a system, and move that ship there', async () => {
  const user = userEvent.setup();
  render(<GmStarmapModule session={session} />);

  const module = screen.getByRole('region', { name: 'GM starmap' });
  await user.selectOptions(within(module).getByRole('combobox', { name: /ship to move/i }), 'aegis');
  await user.click(within(module).getByRole('button', { name: /system 5143/i }));
  await user.click(within(module).getByRole('button', { name: /move ship to location/i }));

  expect(moveShipToLocation).toHaveBeenCalledWith('aegis', '5143');
});

it('shows every GM coordinate even when the selected ship knows only its origin', async () => {
  const user = userEvent.setup();
  render(<GmStarmapModule session={{ ...session, playerDiscovery: {
    groupId: 'fleet-1', shipId: 'aegis', currentCoordinate: '0000',
    knownCoordinates: ['0000'], knownSystems: { 'system-01': '0000' },
    navigationLogs: [], pursuitDistance: 0, revision: 0,
  } }} />);
  const module = screen.getByRole('region', { name: 'GM starmap' });
  for (const coordinate of Object.values(ORGANISER_SYSTEMS)) {
    expect(within(module).getByRole('button', { name: new RegExp(`^System ${coordinate} //`) }))
      .toHaveAttribute('data-system-coordinate', coordinate);
  }
  await user.selectOptions(within(module).getByRole('combobox', { name: /ship to move/i }), 'dione');
  expect(module.querySelectorAll('[data-system-coordinate]')).toHaveLength(22);
});

it('freezes ship movement during endgame evaluation', async () => {
  const user = userEvent.setup();
  vi.mocked(moveShipToLocation).mockClear();
  render(<GmStarmapModule session={{ ...session, phase: 'debrief' }} />);

  const module = screen.getByRole('region', { name: 'GM starmap' });
  await user.click(within(module).getByRole('button', { name: /system 5143/i }));

  expect(within(module).getByRole('button', { name: /move ship to location/i })).toBeDisabled();
  expect(within(module).getByRole('status')).toHaveTextContent(
    /endgame evaluation.*ship movement is frozen/i,
  );
  expect(moveShipToLocation).not.toHaveBeenCalled();
});

it('keeps an enabled toggle from plotting Capybara outside the canonical expansion roster', () => {
  render(<GmStarmapModule session={{
    ...session,
    playerCount: 8,
    expansion: 'base',
    capybaraEnabled: true,
    activeRoleIds: ['admiral'],
    activeVesselIds: ['aegis'],
  } as unknown as GameSession} />);

  expect(within(screen.getByRole('region', { name: 'GM starmap' }))
    .queryByRole('option', { name: 'Capybara' })).not.toBeInTheDocument();
});

it('removes a destroyed selected ship while keeping living movement choices and fallback', async () => {
  const user = userEvent.setup();
  vi.mocked(moveShipToLocation).mockClear();
  const { rerender } = render(<GmStarmapModule session={{
    ...session,
    activeVesselIds: ['aegis', 'dione'],
  } as unknown as GameSession} />);
  const module = screen.getByRole('region', { name: 'GM starmap' });

  await user.selectOptions(within(module).getByRole('combobox', { name: /ship to move/i }), 'dione');
  await user.click(within(module).getByRole('button', { name: /system 5143/i }));

  rerender(<GmStarmapModule session={{
    ...session,
    activeVesselIds: ['aegis', 'dione'],
    shipDamage: {
      dione: { damagedSystemIds: ['reactor'], destroyed: true },
    },
  } as unknown as GameSession} />);

  const selector = within(module).getByRole('combobox', { name: /ship to move/i });
  await vi.waitFor(() => expect(selector).toHaveValue('aegis'));
  expect(within(module).queryByRole('option', { name: 'Dione' })).not.toBeInTheDocument();
  expect(within(module).getByRole('option', { name: /aegis/i })).toBeInTheDocument();
  expect(within(module).getByRole('button', { name: /system 0000/i })).toHaveAccessibleName(/AEGIS/);
  expect(within(module).getByRole('button', { name: /system 0000/i })).not.toHaveAccessibleName(/DIONE/);

  await user.click(within(module).getByRole('button', { name: /move ship to location/i }));
  expect(moveShipToLocation).toHaveBeenCalledWith('aegis', '5143');
});


it('follows authoritative chart changes instead of keeping a local overlay selection', () => {
  const { rerender } = render(<GmStarmapModule session={{ ...session, chartId: 'B', organiserSites: organiserSitesFor('B') }} />);
  expect(screen.getByText('Chart B // labelled overlay')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /system 6798.*active wolf fortress/i })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: 'Organiser chart' })).not.toBeInTheDocument();

  rerender(<GmStarmapModule session={{ ...session, chartId: 'C', organiserSites: organiserSitesFor('C') }} />);
  expect(screen.getByText('Chart C // labelled overlay')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /system 6798.*ancient jump ring/i })).toBeInTheDocument();

  rerender(<GmStarmapModule session={{ ...session, chartId: 'C', organiserSites: organiserSitesFor('B'), setup: {
    playerCount: 8, chartId: 'B', expansion: 'base', turnLimit: 8,
    dioneEnabled: false, capybaraEnabled: false, universalArbourEnabled: false,
    wolfCultEnabled: false, activeRoleIds: ['admiral'], activeVesselIds: ['aegis'],
  } }} />);
  expect(screen.getByText('Chart B // labelled overlay')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /system 6798.*active wolf fortress/i })).toBeInTheDocument();
});
