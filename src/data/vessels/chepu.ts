import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'chepu',
  name: 'P.D.S. Chepu',
  shortName: 'Chepu',
  consoleName: 'P.D.S. Chepu',
  operator: 'Gliese',
  operatorShort: 'P.D.S.',
  vesselType: 'Assault shuttle',
  description: 'Moves security teams and reinforces boarding defence for the Refinery 124 P.D.F. Colonel.',
  captainRoleId: 'refinery-124-pdf-colonel',
  // Source: purchased DoWNE - A4 Double Sided v1.1.pdf, physical PDF p. 81.
  // The Chepu panel lists no away-mission rule; the adjacent fighter-wing panel is separate.
  awayMission: { participation: 'not-printed' },
  cargoTransferTypes: ['securityTeams'],
  cargoTransfer: 'Security teams only',
  initialDocking: { shipId: 'refinery-124', dockedAt: 'SESSION START' },
  operations: [
    {
      name: 'Cargo transfer',
      phase: 'Coordination',
      effect: 'Transfer security teams to and from ships where the Chepu is docked.',
    },
    {
      name: 'Boarding defence',
      phase: 'Wolf attack',
      effect: 'The docked ship may use its security teams to help repel boarders.',
    },
    {
      name: 'Fuelled redeployment',
      phase: 'Wolf attack',
      effect: 'When fuelled, move to a chosen ship at the start of the Boarding Action step.',
    },
  ],
});
