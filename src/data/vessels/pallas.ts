import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'pallas',
  name: 'I.C.S.S. Pallas',
  shortName: 'Pallas',
  consoleName: 'I.C.S.S. Pallas',
  operator: 'Interstellar Council Service Navy',
  operatorShort: 'I.C.N.',
  vesselType: 'Assault shuttle',
  description: 'Moves security teams and reinforces boarding defence for the AEGIS Executive Officer.',
  captainRoleId: 'executive-officer',
  cargoTransfer: 'Security teams only',
  initialDocking: { shipId: 'aegis', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Cargo transfer',
      phase: 'Coordination',
      effect: 'Transfer security teams to and from ships where the Pallas is docked.',
    },
    {
      name: 'Boarding defence',
      phase: 'Wolf attack',
      effect: 'The docked ship may use its security teams to defend and reroll up to 3 boarding dice.',
    },
    {
      name: 'Fuelled redeployment',
      phase: 'Wolf attack',
      effect: 'When fuelled, move to a chosen ship at the start of the Boarding Action step.',
    },
  ],
});
