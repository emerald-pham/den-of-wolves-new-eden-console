import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WolfAttackMemberView } from '@/types/game';
import { WolfAttackStatusView } from './WolfAttackStatusPanel';

const view: WolfAttackMemberView = {
  type: 'wolf-attack-member-view', schemaVersion: 1, sessionId: 's1', attackId: 'wolf-attack-7',
  turn: 7, revision: 9, status: 'resolved', phase: 'active', currentStep: 'resolved', range: null,
  remainingThreatCount: 3, returningThreatCount: 1,
  deadlineAt: '2026-10-04T10:00:00.000Z', serverTime: '2026-10-04T09:59:00.000Z',
  visibility: 'members', redaction: ['composition', 'unresolved-dice', 'facilitator-notes', 'intervention-state'],
  results: [
    { range: 'boarding', sourceId: 'wolf-attack-damage', targetId: 'aegis', bearing: null,
      contactReference: 'AEGIS damage record', effect: 'Wolf attack applies 3 damage to AEGIS',
      outcome: { damage: 3, destroyed: false, populationLoss: 250 }, serverTime: '2026-10-04T09:58:00.000Z' },
    { range: 'boarding', sourceId: 'doctor-medical-aid', targetId: 'aegis', bearing: null,
      contactReference: 'AEGIS medical-aid result', effect: 'Doctor Medical Aid prevents 1 casualty',
      outcome: { casualtiesPrevented: 1, foodSpent: 0, waterSpent: 0 }, serverTime: '2026-10-04T09:59:00.000Z' },
    { range: 'boarding', sourceId: 'warrior-salvage-drones', targetId: 'aegis', bearing: null,
      contactReference: 'AEGIS materials', effect: 'Warrior Salvage Drones salvage from attack damage',
      outcome: { materialsGained: 2 }, serverTime: '2026-10-04T09:59:00.000Z' },
    { range: 'boarding', sourceId: 'capybara-scrap-collection', targetId: 'aegis', bearing: null,
      contactReference: 'AEGIS scrap opportunity', effect: 'Macaw collected the attack Scrap',
      outcome: { scrapGained: 1 }, serverTime: '2026-10-04T09:59:00.000Z' },
  ],
};

describe('Wolf aftermath status presenter', () => {
  it('shows combat, Doctor, salvage, and Scrap outcomes without exposing private draws', () => {
    render(<WolfAttackStatusView view={view} />);

    expect(screen.getByText(/3 damage.*250 population lost/i)).toBeVisible();
    expect(screen.getByText(/1 casualty prevented/i)).toBeVisible();
    expect(screen.getByText(/2 materials recovered/i)).toBeVisible();
    expect(screen.getByText(/1 Scrap collected/i)).toBeVisible();
    expect(screen.getByText(/3 remaining hostile ships.*1 returning next attack/i)).toBeVisible();
    expect(screen.queryByText(/damage dice|A♥|fighter-bay-alpha/i)).not.toBeInTheDocument();
  });
});
