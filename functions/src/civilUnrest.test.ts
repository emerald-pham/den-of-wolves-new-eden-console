import { expect, it } from 'vitest';
import { requireCivilUnrestGrievanceRequest } from './requestGuards';
import { civilUnrestShipsForRole } from './civilUnrest';

it('keeps ordinary team authority on its assigned ship and union authority bounded to its pair', () => {
  expect(civilUnrestShipsForRole('icebreaker-miner')).toEqual(['icebreaker']);
  expect(civilUnrestShipsForRole('joint-engineering-shepherd-icebreaker'))
    .toEqual(['shepherd', 'icebreaker']);
  expect(civilUnrestShipsForRole('press-officer')).toEqual([]);
  expect(civilUnrestShipsForRole('commissar')).toEqual(['icebreaker']);
  expect(civilUnrestShipsForRole('wolf-commander')).toEqual([]);
});

it('parses the grievance CAS and audience contract', () => {
  expect(requireCivilUnrestGrievanceRequest({
    sessionId: 'session', requestId: 'request', crisisId: 'civil-unrest',
    expectedCrisisRevision: 3, expectedGrievanceRevision: 1,
    affectedShipId: 'icebreaker', visibility: 'private', text: 'We need relief.',
  })).toMatchObject({ expectedCrisisRevision: 3, expectedGrievanceRevision: 1, visibility: 'private' });
  expect(() => requireCivilUnrestGrievanceRequest({
    sessionId: 'session', requestId: 'request', crisisId: 'civil-unrest',
    expectedCrisisRevision: 3, expectedGrievanceRevision: 1,
    visibility: 'public', text: 'x'.repeat(2001),
  })).toThrow();
});
