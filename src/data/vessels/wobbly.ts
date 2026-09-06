import { defineShuttle } from './templates';

/**
 * The printed Union sheets identify separate ship/shuttle pairings but do not
 * name which pairing owns Wobbly; its session docking stays facilitator-set.
 */
export default defineShuttle({
  id: 'wobbly',
  name: 'U.S. Wobbly',
  shortName: 'Wobbly',
  consoleName: 'U.S. Wobbly',
  operator: 'Joint Engineering Union',
  operatorShort: 'J.E.U.',
  vesselType: 'Service shuttle',
  description: 'Recharges consoles and carries full cargo for the Quellon / Refinery Union Engineer.',
  captainRoleId: 'joint-engineering-quellon-refinery',
  availability: 'gm-controlled',
  cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
  operations: [
    {
      name: 'Recharge',
      phase: 'Coordination',
      effect: 'When fuelled, charge one console. A console with an immediate maintenance effect resolves immediately.',
    },
    {
      name: 'Boarding defence',
      phase: 'Wolf attack',
      effect: 'The docked ship may use its security teams to help repel boarders.',
    },
  ],
});
