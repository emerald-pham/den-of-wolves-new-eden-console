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
    expect(screen.getByText(/HOUSE RULE.*request.*remains pending until the current live GM records the consequence/i)).toBeVisible();
  });

  it('makes Militia double-team and front-line risk explicit before submission', () => {
    const onChoose = vi.fn();
    render(<WolfBoardingMilitiaChoicePanelView view={{
      type: 'wolf-boarding-militia-choice-view', status: 'pending',
      targetShipId: 'aegis', boardingParties: 8, availableSecurityTeams: 3,
      selectedSecurityTeams: 2, maxFrontLineDice: 3, doubleDiceAvailable: true,
    }} onChoose={onChoose} />);

    expect(screen.getByText(/ship crew committed 2 security teams/i)).toBeVisible();
    expect(screen.queryByLabelText(/security teams to commit/i)).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /roll two dice per security team/i }));
    fireEvent.change(screen.getByLabelText(/front-line dice/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /commit militia risk/i }));
    expect(onChoose).toHaveBeenCalledWith({ militiaDoubleTeams: true, militiaFrontLineDice: 2 });
  });

  it('offers all three front-line dice with no Security Teams and explains the printed 1 consequence', () => {
    const onChoose = vi.fn();
    render(<WolfBoardingMilitiaChoicePanelView view={{
      type: 'wolf-boarding-militia-choice-view', status: 'pending',
      targetShipId: 'aegis', boardingParties: 2, availableSecurityTeams: 0,
      selectedSecurityTeams: 0, maxFrontLineDice: 3, doubleDiceAvailable: true,
    }} onChoose={onChoose} />);

    const select = screen.getByRole('combobox', { name: /front-line dice/i });
    expect(Array.from((select as HTMLSelectElement).options).map(option => option.value)).toEqual(['0', '1', '2', '3']);
    expect(screen.getByText('A front-line 1 kills the Militia Leader. Team losses apply only up to the available Security Teams.'))
      .toBeVisible();
    fireEvent.change(select, { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /commit militia risk/i }));
    expect(onChoose).toHaveBeenCalledWith({ militiaDoubleTeams: false, militiaFrontLineDice: 3 });
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

  it('lets a source reroll a die already rerolled by the other source', () => {
    const onChoose = vi.fn();
    render(<WolfBoardingRerollChoicePanelView view={{
      type: 'wolf-boarding-reroll-choice-view', source: 'pallas', status: 'pending',
      dice: [{ targetShipId: 'aegis', dieIndex: 0, value: 4 }],
      alreadyRerolled: [], maxRerolls: 3,
    }} onChoose={onChoose} />);

    expect(screen.getByText('Choose up to 3 dice. Each die can be rerolled once by this source.')).toBeVisible();
    const die = screen.getByRole('checkbox', { name: /aegis die 1: 4/i });
    expect(die).toBeEnabled();
    fireEvent.click(die);
    fireEvent.click(screen.getByRole('button', { name: /reroll selected dice/i }));
    expect(onChoose).toHaveBeenCalledWith([{ targetShipId: 'aegis', dieIndex: 0 }]);
  });

  it('labels the optional Commander consequence as a house rule and keeps the live GM control explicit', () => {
    const onChoose = vi.fn();
    render(<WolfBoardingCommanderRulingPanelView view={{
      type: 'wolf-boarding-commander-ruling-view', status: 'pending',
      targetShipId: 'aegis', condition: 'HOUSE RULE: The action stays pending until the live GM records what happens if all Commander-led Wolf Boarding Parties are destroyed. No automatic consequence is assumed.',
    }} onChoose={onChoose} />);

    expect(screen.getByRole('region', { name: /facilitator ruling for the optional wolf commander boarding action/i })).toBeVisible();
    expect(screen.getByText(/HOUSE RULE.*live GM.*no automatic consequence/i)).toBeVisible();

    const submit = screen.getByRole('button', { name: /record facilitator ruling/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Facilitator ruling' }), { target: { value: 'The transport is removed from the next attack.' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(onChoose).toHaveBeenCalledWith('The transport is removed from the next attack.');
  });
});
