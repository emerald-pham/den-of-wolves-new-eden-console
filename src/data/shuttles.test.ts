import { describe, expect, it } from 'vitest';
import { INITIAL_SHUTTLE_DOCKINGS, INITIAL_SHUTTLE_VISITS, shuttlebayForShip } from './shuttles';

describe('fleet shuttlebays', () => {
  it('starts the SNN Independent Press Shuttle docked to AEGIS', () => {
    expect(INITIAL_SHUTTLE_DOCKINGS).toEqual([
      expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'aegis' }),
    ]);
    expect(INITIAL_SHUTTLE_VISITS).toEqual([
      expect.objectContaining({ shuttleId: 'snn-press-shuttle', shipId: 'aegis', action: 'docked' }),
    ]);
  });

  it('reports the docked craft and visit history independently for every ship', () => {
    const session = {
      shuttleDockings: INITIAL_SHUTTLE_DOCKINGS,
      shuttleVisitLog: INITIAL_SHUTTLE_VISITS,
    };

    expect(shuttlebayForShip(session, 'aegis').dockedShuttles[0]?.name)
      .toBe('SNN Independent Press Shuttle');
    expect(shuttlebayForShip(session, 'aegis').visits).toHaveLength(1);
    expect(shuttlebayForShip(session, 'dione').dockedShuttles).toEqual([]);
    expect(shuttlebayForShip(session, 'dione').visits).toEqual([]);
  });
});

it('keeps press docking visible but outside the linked mechanical bays', () => {
  const bay = shuttlebayForShip({}, 'aegis');
  expect(bay.mechanicalBays.map(item => item.name)).toEqual(['Shuttle Bay Zeta', 'Shuttle Bay Omega']);
  expect(bay.mechanicalDockedShuttles).toEqual([]);
  expect(bay.pressDockedShuttles).toHaveLength(1);
  expect(bay.dockedShuttles).toHaveLength(1);
  expect(shuttlebayForShip({}, 'capybara').mechanicalBays).toHaveLength(1);
});
