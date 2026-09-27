import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import EndeavourResearchChoices from './EndeavourResearchChoices';
import type { EndeavourResearchWorkspace } from '@/lib/endeavourResearchService';

const workspace: EndeavourResearchWorkspace = {
  status: 'ready', sessionId: 'review', cycle: 3, researchRevision: 1,
  cadence: { cycle: 3, revision: 1, choices: [{ trackId: 'reactor', funding: 'standard', oreCost: 0 }] },
  progress: { reactor: 2, 'jump-drive': 0 },
  tracks: [
    { trackId: 'reactor', name: 'Reactor', crossedBoxes: 2, totalBoxes: 5, currentMaterialCost: 7, complete: false },
    { trackId: 'jump-drive', name: 'Jump Drive', crossedBoxes: 0, totalBoxes: 5, currentMaterialCost: 14, complete: false },
  ],
  shepherdOre: 10,
  fieldUpgradeState: { upgradeRevision: 0, targetsUsedThisCycle: 0 },
};

it('renders the production research controls with current prices, used choices, and a selectable sample action', async () => {
  const onSelect = vi.fn();
  const onAdvance = vi.fn();
  render(<EndeavourResearchChoices
    workspace={workspace}
    selectedTrackId="jump-drive"
    liveTeamPhase
    onSelectTrack={onSelect}
    onAdvance={onAdvance}
    onRefresh={vi.fn()}
  />);

  expect(screen.getByRole('region', { name: 'Endeavour research controls' })).toHaveTextContent('Cycle choices: 1 of 3 standard; 0 of 2 additional.');
  expect(screen.getByRole('list', { name: 'Research progress' })).toHaveTextContent('Reactor: 2 of 5 boxes crossed; next field-upgrade cost is 7 materials. Chosen this cycle.');
  expect(screen.getByRole('list', { name: 'Research progress' })).toHaveTextContent('Jump Drive: 0 of 5 boxes crossed; next field-upgrade cost is 14 materials. Available for a research choice.');
  expect(screen.getByRole('option', { name: 'Reactor' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Advance standard research' }));
  expect(onAdvance).toHaveBeenCalledWith('standard');
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Research track' }), 'jump-drive');
  expect(onSelect).toHaveBeenCalledWith('jump-drive');
});

it('shows coordination unavailability and refreshed status without enabling research writes', () => {
  render(<EndeavourResearchChoices
    workspace={workspace}
    selectedTrackId="jump-drive"
    liveTeamPhase={false}
    notice="Scientist workspace refreshed."
    onSelectTrack={vi.fn()}
    onAdvance={vi.fn()}
    onRefresh={vi.fn()}
  />);
  expect(screen.getByText('Research choices are available during the live Team Phase.')).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Scientist workspace refreshed.');
  expect(screen.getByRole('button', { name: 'Advance standard research' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Advance with 5 Shepherd ore' })).toBeDisabled();
});
