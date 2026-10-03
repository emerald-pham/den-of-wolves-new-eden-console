import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  WolfBoardingCommanderChoicePanelView,
  WolfBoardingCommanderRulingPanelView,
  WolfBoardingMilitiaChoicePanelView,
  WolfBoardingRerollChoicePanelView,
  WolfBoardingSupportChoicePanelView,
} from './WolfBoardingChoicePanels';

describe('Wolf boarding decision presenters', () => {
  it('offers only fuelled Pallas/Chepu relocation destinations and an explicit stay choice', () => {
    const onChoose = vi.fn();
    render(<WolfBoardingSupportChoicePanelView view={{
      type: 'wolf-boarding-support-choice-view', status: 'pending', craftId: 'pallas',
      currentHostId: 'aegis', fuelled: true, legalHostIds: ['aegis', 'dione', 'refinery-124'],
    }} onChoose={onChoose} />);

    fireEvent.click(screen.getByRole('button', { name: /move pallas to dione/i }));
    expect(onChoose).toHaveBeenCalledWith('dione');
    expect(screen.queryByRole('button', { name: /move pallas to aegis/i })).toBeNull();
  });

  it('shows the Commander +2 target choice before a pass', () => {
    const onChoose = vi.fn();
    render(<WolfBoardingCommanderChoicePanelView view={{
      type: 'wolf-boarding-commander-choice-view', status: 'pending',
      targets: [{ targetShipId: 'aegis', boardingParties: 8 }, { targetShipId: 'dione', boardingParties: 4 }],
    }} onChoose={onChoose} />);

    fireEvent.click(screen.getByRole('button', { name: /lead at aegis/i }));
    expect(onChoose).toHaveBeenCalledWith('aegis');
  });

  it('makes Militia double-team and front-line risk explicit before submission', () => {
    const onChoose = vi.fn();
    render(<WolfBoardingMilitiaChoicePanelView view={{
      type: 'wolf-boarding-militia-choice-view', status: 'pending',
      targetShipId: 'aegis', boardingParties: 8, availableSecurityTeams: 3,
      maxFrontLineDice: 3, doubleDiceAvailable: true,
    }} onChoose={onChoose} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /roll two dice per security team/i }));
    fireEvent.change(screen.getByLabelText(/front-line dice/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /commit defence/i }));
    expect(onChoose).toHaveBeenCalledWith({ securityTeams: 3, militiaDoubleTeams: true, militiaFrontLineDice: 2 });
  });

  it('selects indexed defense dice for each independent reroll allowance', () => {
    const onChoose = vi.fn();
    render(<WolfBoardingRerollChoicePanelView view={{
      type: 'wolf-boarding-reroll-choice-view', source: 'pallas', status: 'pending',
      dice: [{ targetShipId: 'aegis', dieIndex: 0, value: 1 }, { targetShipId: 'dione', dieIndex: 0, value: 4 }],
      alreadyRerolled: [], maxRerolls: 3,
    }} onChoose={onChoose} />);

    fireEvent.click(screen.getByRole('checkbox', { name: /aegis die 1: 1/i }));
    fireEvent.click(screen.getByRole('button', { name: /reroll selected dice/i }));
    expect(onChoose).toHaveBeenCalledWith([{ targetShipId: 'aegis', dieIndex: 0 }]);
  });

  it('requires a non-empty GM ruling only when all Commander-led parties are lost', () => {
    const onChoose = vi.fn();
    render(<WolfBoardingCommanderRulingPanelView view={{
      type: 'wolf-boarding-commander-ruling-view', status: 'pending',
      targetShipId: 'aegis', condition: 'All Commander-led Wolf Boarding Parties were destroyed.',
    }} onChoose={onChoose} />);

    const submit = screen.getByRole('button', { name: /record facilitator ruling/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/facilitator ruling/i), { target: { value: 'The transport is removed from the next attack.' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onChoose).toHaveBeenCalledWith('The transport is removed from the next attack.');
  });
});
