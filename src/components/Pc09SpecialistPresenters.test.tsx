import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import {
  PdfFighterAcePanel,
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
