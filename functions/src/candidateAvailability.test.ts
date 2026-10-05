import { expect, it } from 'vitest';
import { candidateAvailableVesselIds, requireCandidateVesselsAvailable,
  requireCandidateCraftAvailable, reserveCandidateEngineeringCraft } from './candidateAvailability';

const disposition = (outcome: string) => ({ code: 'N', groupId: 'fleet-1', shipId: 'aegis',
  sourceId: 'passage-1', cycle: 6, outcome });
const reservation = { code: 'N' as const, groupId: 'fleet-1', coordinate: '6798', sourceId: 'craft-1', cycle: 6 };
const session = (fields: Record<string, unknown>) => ({ get: (field: string) => fields[field] });
it.each(['crossed', 'reached', 'lost', 'left-behind', 'cannibalised', 'settled'])(
  'blocks fresh %s vessel actions while other vessels remain available', outcome => {
    const world = session({ candidateVesselOutcomes: { aegis: disposition(outcome) } });
    expect(() => requireCandidateVesselsAvailable(world, ['aegis'])).toThrow(/candidate|settled|unavailable/i);
    expect(() => requireCandidateVesselsAvailable(world, ['shepherd'])).not.toThrow();
    expect(candidateAvailableVesselIds(world, ['aegis', 'shepherd'])).toEqual(['shepherd']);
  });
it('fails closed on malformed private availability authority', () => {
  expect(() => requireCandidateVesselsAvailable(session({ candidateVesselOutcomes: [] }), ['aegis'])).toThrow();
  expect(() => requireCandidateCraftAvailable(session({ candidateCraftReservations: { philia: { ...reservation, cycle: 0 } } }), ['philia'])).toThrow();
});
it('permanently reserves each Engineering Shuttle once without exposing the reservation', () => {
  const reserved = reserveCandidateEngineeringCraft(undefined, 'philia', reservation);
  expect(reserved).toEqual({ philia: reservation });
  const world = session({ candidateCraftReservations: reserved });
  expect(() => requireCandidateCraftAvailable(world, ['philia'])).toThrow(/consumed|Ring/i);
  expect(() => requireCandidateCraftAvailable(world, ['macaw'])).not.toThrow();
  expect(() => reserveCandidateEngineeringCraft(reserved, 'philia', { ...reservation, sourceId: 'craft-2' })).toThrow();
  expect(() => reserveCandidateEngineeringCraft(undefined, 'starlight', reservation)).toThrow();
});
