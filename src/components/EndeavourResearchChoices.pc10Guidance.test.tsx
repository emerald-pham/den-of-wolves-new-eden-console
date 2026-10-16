import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { resolveEndeavourResearchChoice } from '../../functions/src/endeavourResearchCadence';
import { endeavourResearchTrack } from '../../functions/src/endeavourResearch';
import type { EndeavourResearchWorkspace } from '@/lib/endeavourResearchService';
import EndeavourResearchChoices from './EndeavourResearchChoices';

function workspace(ore: number): EndeavourResearchWorkspace {
  return {
    status: 'ready', sessionId: 'guidance-session', cycle: 2, researchRevision: 0,
    cadence: { cycle: 0, revision: 0, choices: [] }, progress: {}, shepherdOre: ore,
    tracks: [endeavourResearchTrack({}, 'reactor')],
    fieldUpgradeState: { upgradeRevision: 0, targetsUsedThisCycle: 0 },
  };
}

function resolve(funding: 'standard' | 'shepherd-ore', ore: number) {
  return resolveEndeavourResearchChoice({ state: { cycle: 0, revision: 0, choices: [] },
    progress: {}, cycle: 2, expectedRevision: 0, trackId: 'reactor', funding, shepherdOre: ore,
    actorScope: 'player', turnPhase: { airspace: { state: 'restricted' } } });
}

it('explains the source-zero ore standard choice while the existing standard callback remains usable with no ore', async () => {
  const result = resolve('standard', 0);
  expect(result.choice.oreCost).toBe(0);
  expect(result.remainingShepherdOre).toBe(0);
  const advance = vi.fn();
  render(<EndeavourResearchChoices workspace={workspace(0)} selectedTrackId="reactor" liveTeamPhase
    onSelectTrack={vi.fn()} onAdvance={advance} onRefresh={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Advance with 5 Shepherd ore' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Advance standard research' }));
  expect(advance).toHaveBeenCalledExactlyOnceWith('standard');
  expect(screen.getByText(/Standard research.*0 Shepherd ore/i)).toBeVisible();
  expect(screen.getByText(/materials.*later field upgrades.*not.*research choice/i)).toBeVisible();
});

it('keeps the five-ore additional callback and its server debit distinct from the standard cost explanation', async () => {
  const result = resolve('shepherd-ore', 8);
  expect(result.choice.oreCost).toBe(5);
  expect(result.remainingShepherdOre).toBe(3);
  const advance = vi.fn();
  render(<EndeavourResearchChoices workspace={workspace(8)} selectedTrackId="reactor" liveTeamPhase
    onSelectTrack={vi.fn()} onAdvance={advance} onRefresh={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Advance with 5 Shepherd ore' }));
  expect(advance).toHaveBeenCalledExactlyOnceWith('shepherd-ore');
  expect(screen.getByText(/Additional research.*5 Shepherd ore/i)).toBeVisible();
  expect(screen.getByText(/Standard research.*0 Shepherd ore/i)).toBeVisible();
});

it('does not turn price guidance into a research grant outside the existing live Team Phase', async () => {
  expect(() => resolveEndeavourResearchChoice({ state: { cycle: 0, revision: 0, choices: [] },
    progress: {}, cycle: 2, expectedRevision: 0, trackId: 'reactor', funding: 'standard', shepherdOre: 8,
    actorScope: 'player', turnPhase: { airspace: { state: 'lifted' } } })).toThrow(/Team Phase/);
  const advance = vi.fn();
  render(<EndeavourResearchChoices workspace={workspace(8)} selectedTrackId="reactor" liveTeamPhase={false}
    onSelectTrack={vi.fn()} onAdvance={advance} onRefresh={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Advance standard research' }));
  expect(advance).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Advance with 5 Shepherd ore' })).toBeDisabled();
  expect(screen.getByText(/Standard research.*0 Shepherd ore/i)).toBeVisible();
});

it('retains the real distinct-choice quota after standard research has used three choices', () => {
  const used: EndeavourResearchWorkspace = { ...workspace(8), cadence: { cycle: 2, revision: 3, choices: [
    { trackId: 'jump-drive', funding: 'standard', oreCost: 0 },
    { trackId: 'hydroponics', funding: 'standard', oreCost: 0 },
    { trackId: 'water-reclamation', funding: 'standard', oreCost: 0 },
  ] } };
  expect(() => resolveEndeavourResearchChoice({ state: used.cadence, progress: {}, cycle: 2,
    expectedRevision: 3, trackId: 'reactor', funding: 'standard', shepherdOre: 8,
    actorScope: 'player', turnPhase: { airspace: { state: 'restricted' } } })).toThrow(/all three/);
  render(<EndeavourResearchChoices workspace={used} selectedTrackId="reactor" liveTeamPhase
    onSelectTrack={vi.fn()} onAdvance={vi.fn()} onRefresh={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Advance standard research' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Advance with 5 Shepherd ore' })).toBeEnabled();
  expect(screen.getByText(/Standard research.*0 Shepherd ore/i)).toBeVisible();
});
