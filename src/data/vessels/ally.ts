import { defineShuttle } from './templates';

/**
 * The printed Union sheets identify separate ship/shuttle pairings but do not
 * name which pairing owns Ally; its session docking stays facilitator-set.
 */
export default defineShuttle({
  id: 'ally',
  name: 'U.S. Ally',
  shortName: 'Ally',
  consoleName: 'U.S. Ally',
  operator: 'Joint Engineering Union',
  operatorShort: 'J.E.U.',
  vesselType: 'Engineering shuttle',
  description: 'Repairs fleet consoles and carries full cargo for the Shepherd / Icebreaker Union Engineer.',
  captainRoleId: 'joint-engineering-shepherd-icebreaker',
  availability: 'gm-controlled',
  cargoTransfer: 'Security teams, strytium ore, fuel, food, water, and materials',
  operations: [
    {
      name: 'Repair',
      phase: 'Coordination',
      effect: 'Repair up to 2 consoles on one ship for 4 materials each, or damage a console with a ship player’s permission to gain 3 materials.',
    },
    {
      name: 'Fuelled repair',
      phase: 'Coordination',
      effect: 'When fuelled, repair or scrap consoles on a second ship.',
    },
    {
      name: 'Boarding defence',
      phase: 'Wolf attack',
      effect: 'The docked ship may use its security teams to help repel boarders.',
    },
  ],
});
