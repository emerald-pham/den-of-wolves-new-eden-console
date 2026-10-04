import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import {
  PdfFighterAcePermissionPanel,
  PdfFighterAcePanel,
  VipHostMaintenanceRerollPanel,
  VipHostPanel,
  WolfAgentDetectorPanel,
} from './Pc09SpecialistPresenters';

it('runs a private detector test through an injected action and displays only the report', async () => {
  const onTest = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<WolfAgentDetectorPanel
    cycle={4} testsUsed={1} targets={[{ uid: 'target-1', label: 'Alex' }]}
    report={{ targetLabel: 'Alex', reportedLoyalty: 'wolf', cycle: 4 }}
    onTest={onTest}
  />);

  expect(screen.getByText('2 tests remain this cycle.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Run detector test' }));
  await waitFor(() => expect(onTest).toHaveBeenCalledWith('target-1'));
  expect(screen.getByText('Alex // Report: Wolf // Cycle 4')).toBeVisible();
  expect(document.body.textContent).not.toMatch(/actual truth|accuracy roll|suspicion/i);
});

it('locks the detector action after three tests in the current cycle', () => {
  const onTest = vi.fn();
  render(<WolfAgentDetectorPanel cycle={4} testsUsed={3}
    targets={[{ uid: 'target-1', label: 'Alex' }]} report={null} onTest={onTest} />);
  expect(screen.getByText('0 tests remain this cycle.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Run detector test' })).toBeDisabled();
  expect(onTest).not.toHaveBeenCalled();
});

it('uses singular grammar when one detector test remains', () => {
  render(<WolfAgentDetectorPanel cycle={4} testsUsed={2}
    targets={[{ uid: 'target-1', label: 'Alex' }]} report={null} onTest={vi.fn()} />);
  expect(screen.getByText('1 test remains this cycle.')).toBeVisible();
});

it('attests a physical VIP visit and consumes the hosted maintenance grant using injected actions', async () => {
  const onAttestVisit = vi.fn().mockResolvedValue(undefined);
  const onReroll = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<VipHostPanel
    cycle={3} visitStatus="unattested" currentShipId="dione"
    destinations={[{ id: 'aegis', label: 'AEGIS' }]}
    grant={{ shipLabel: 'AEGIS', cycle: 3, status: 'available' }}
    onAttestVisit={onAttestVisit} onReroll={onReroll}
  />);

  await user.click(screen.getByRole('button', { name: 'Record ship visit' }));
  await waitFor(() => expect(onAttestVisit).toHaveBeenCalledWith('aegis'));
  await user.click(screen.getByRole('button', { name: 'Reroll one maintenance die' }));
  await waitFor(() => expect(onReroll).toHaveBeenCalledWith('aegis', 3));
});

it('submits a Fighter Ace combat choice through an injected action', async () => {
  const onCommit = vi.fn().mockResolvedValue({ outcome: 'hit', damage: 1 });
  const user = userEvent.setup();
  render(<PdfFighterAcePanel
    attackId="attack-7" range="medium"
    fighterSources={[{ id: 'pdf-escort-fighter-wing', label: 'Refinery 124 wing', fighters: 2 }]}
    targets={[{ id: 'contact-1', label: 'Wolf contact 1' }]}
    onCommit={onCommit}
  />);

  await user.click(screen.getByRole('button', { name: 'Commit Fighter Ace action' }));
  await waitFor(() => expect(onCommit).toHaveBeenCalledWith({
    attackId: 'attack-7', sourceId: 'pdf-escort-fighter-wing', targetId: 'contact-1',
    range: 'medium', targetShift: undefined,
  }));
});

it('lets the Fighter Ace choose the optional second Short-range contact', async () => {
  const onCommit = vi.fn().mockResolvedValue({ outcome: 'hit', damage: 2 });
  const user = userEvent.setup();
  render(<PdfFighterAcePanel attackId="attack-8" range="short"
    fighterSources={[{ id: 'pdf-escort-fighter-wing', label: 'Refinery 124 wing', fighters: 2 }]}
    targets={[{ id: 'contact-1', label: 'Wolf contact 1' }, { id: 'contact-2', label: 'Wolf contact 2' }]}
    onCommit={onCommit} />);

  await user.selectOptions(screen.getByLabelText('Optional second target'), 'contact-2');
  await user.click(screen.getByRole('button', { name: 'Commit Fighter Ace action' }));
  await waitFor(() => expect(onCommit).toHaveBeenCalledWith({
    attackId: 'attack-8', sourceId: 'pdf-escort-fighter-wing', targetId: 'contact-1',
    range: 'short', targetShift: undefined, extraTargetId: 'contact-2',
  }));
});

it('limits the physical visit and hosted reroll controls to injected authority', () => {
  const { rerender } = render(<VipHostPanel cycle={2} visitStatus="unattested" currentShipId="dione"
    destinations={[{ id: 'icebreaker', label: 'Icebreaker' }]} grant={null}
    canAttestVisit={false} canUseGrant={false}
    onAttestVisit={vi.fn()} onReroll={vi.fn()} />);

  expect(screen.queryByRole('button', { name: 'Record ship visit' })).not.toBeInTheDocument();
  rerender(<VipHostPanel cycle={2} visitStatus="attested" currentShipId="icebreaker"
    destinations={[{ id: 'icebreaker', label: 'Icebreaker' }]}
    grant={{ shipLabel: 'Icebreaker', cycle: 2, status: 'available' }}
    canAttestVisit={false} canUseGrant={false}
    onAttestVisit={vi.fn()} onReroll={vi.fn()} />);

  expect(screen.queryByRole('button', { name: 'Reroll one maintenance die' })).not.toBeInTheDocument();
});

it('lets a current ship officer choose exactly one unrest die for the attested hosted reroll', async () => {
  const onReroll = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<VipHostMaintenanceRerollPanel cycle={4} cycleStep={4} shipLabel="AEGIS"
    unrestRolls={[2, 5]} grantStatus="available" canUseGrant onReroll={onReroll} />);

  await user.selectOptions(screen.getByLabelText('Unrest die'), '1');
  await user.click(screen.getByRole('button', { name: 'Reroll one maintenance die' }));
  await waitFor(() => expect(onReroll).toHaveBeenCalledWith(1));
});

it('lets a source commander authorize one specific current fighter slot', async () => {
  const onGrant = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(<PdfFighterAcePermissionPanel view={{
    type: 'pdf-fighter-ace-permission-view', sessionId: 's1', attackId: 'attack-8',
    turn: 4, revision: 9, range: 'medium', sourceId: 'fighter-wing-alpha',
    sourceLabel: 'AEGIS Fighter Wing Alpha', status: 'ready', reason: null,
    fighters: 3, availableFighterIndexes: [0, 1, 2],
  }} onGrant={onGrant} />);

  await user.selectOptions(screen.getByLabelText('Fighter slot'), '2');
  await user.click(screen.getByRole('button', { name: 'Authorize Fighter Ace' }));
  await waitFor(() => expect(onGrant).toHaveBeenCalledWith({
    attackId: 'attack-8', expectedRevision: 9, sourceId: 'fighter-wing-alpha', fighterIndex: 2,
  }));
});

it('does not offer source permission when the attack range is closed or the Ace is unavailable', () => {
  const { rerender } = render(<PdfFighterAcePermissionPanel view={{
    type: 'pdf-fighter-ace-permission-view', sessionId: 's1', attackId: null,
    turn: 4, revision: 9, range: null, sourceId: 'pdf-escort-fighter-wing',
    sourceLabel: 'PDF Escort Fighter Wing', status: 'closed', reason: 'range-not-open',
    fighters: 4, availableFighterIndexes: [],
  }} onGrant={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Authorize Fighter Ace' })).toBeDisabled();
  expect(screen.getByText(/range is not open/i)).toBeVisible();

  rerender(<PdfFighterAcePermissionPanel view={{
    type: 'pdf-fighter-ace-permission-view', sessionId: 's1', attackId: 'attack-8',
    turn: 4, revision: 9, range: 'long', sourceId: 'pdf-escort-fighter-wing',
    sourceLabel: 'PDF Escort Fighter Wing', status: 'waiting', reason: 'current-ace-unavailable',
    fighters: 4, availableFighterIndexes: [],
  }} onGrant={vi.fn()} />);
  expect(screen.getByText(/current fighter ace is unavailable/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Authorize Fighter Ace' })).toBeDisabled();
});
