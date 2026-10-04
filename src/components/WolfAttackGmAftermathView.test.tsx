import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { WolfAttackGmAftermathView, type WolfAttackGmAftermathViewModel } from './WolfAttackGmAftermathView';

const view: WolfAttackGmAftermathViewModel = {
  attackId: 'wolf-attack-7', turn: 7,
  damage: [{ shipId: 'aegis', amount: 3, populationBefore: 2_500, populationAfter: 2_000,
    destroyed: false, damagedSystemIds: ['storage'], draws: [
      { card: 'A♥', systemName: 'Fighter Bay Alpha', recycled: false, casualty: true, destroyed: false },
      { card: '6♥', systemName: 'Armoured Hull I', recycled: true, casualty: false, destroyed: false },
    ] }],
  doctor: { selectedShipIds: ['aegis'], mitigated: [{ shipId: 'aegis', casualtiesBefore: 1,
    casualtiesAfter: 0, casualtiesPrevented: 1, foodSpent: 0, waterSpent: 0 }] },
  warriorSalvage: { hostShipId: 'aegis', damageDice: [5, 6], materialsGained: 2 },
  scrapClaims: { aegis: { shuttleId: 'macaw', scrap: 1 } },
  returningInstanceIds: ['2:wolf-fighter-wing'],
  survivingWolfShips: [{ instanceId: '3:wolf-fighter-wing', shipId: 'fighter-wing', target: 'dione' }],
  pendingWork: { doctorShipIds: [], salvageAvailable: false, scrapShipIds: [],
    damagedSystems: [{ shipId: 'aegis', systemIds: ['storage'] }],
    survivingThreatInstanceIds: ['3:wolf-fighter-wing'] },
};

describe('GM aftermath receipt view', () => {
  it('presents committed damage, card recycling, casualties, recovery actions, and next work', () => {
    render(<WolfAttackGmAftermathView view={view} />);

    const receipt = screen.getByRole('region', { name: 'Private Wolf aftermath receipt' });
    expect(within(receipt).getByText('AEGIS // 3 damage')).toBeVisible();
    expect(within(receipt).getByText(/A♥.*Fighter Bay Alpha.*casualty/i)).toBeVisible();
    expect(within(receipt).getByText(/6♥.*Armoured Hull I.*recycled/i)).toBeVisible();
    expect(within(receipt).getByText(/Doctor Medical Aid.*1 casualty prevented/i)).toBeVisible();
    expect(within(receipt).getByText(/Warrior Salvage Drones.*2 materials/i)).toBeVisible();
    expect(within(receipt).getByText(/Macaw.*1 Scrap.*AEGIS/i)).toBeVisible();
    expect(within(receipt).getByText(/repair storage on AEGIS/i)).toBeVisible();
    expect(within(receipt).getByText(/surviving threat.*fighter-wing/i)).toBeVisible();
    expect(within(receipt).queryByText(/private preparation|damage deck order|facilitator notes/i)).not.toBeInTheDocument();
  });

  it('shows real unresolved aftermath decisions as pending work', () => {
    render(<WolfAttackGmAftermathView view={{ ...view,
      doctor: undefined, warriorSalvage: undefined, scrapClaims: {},
      pendingWork: { ...view.pendingWork, doctorShipIds: ['aegis'], salvageAvailable: true, scrapShipIds: ['aegis'] },
    }} />);

    const work = screen.getByRole('list', { name: 'Outstanding recovery work' });
    expect(within(work).getByText(/Doctor Medical Aid.*AEGIS/i)).toBeVisible();
    expect(within(work).getByText(/Warrior Salvage Drones/i)).toBeVisible();
    expect(within(work).getByText(/collect Scrap.*AEGIS/i)).toBeVisible();
  });
});
