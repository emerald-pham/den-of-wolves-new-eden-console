import { AEGIS_ROLE_CONSOLES } from '../aegisConsoles';
import icn from '@/assets/flags/icn.png';
import { defineShip } from './templates';

export default defineShip({
  id: 'aegis',
  name: 'AEGIS',
  vesselType: 'Battleship / carrier',
  nation: 'Interstellar Council Service Navy',
  nationShort: 'ICN',
  origin: 'earth',
  description: 'The main protector of the survivor fleet, carrying weapon batteries, fighter squadrons, and marines.',
  flag: icn,
  color: 'var(--cic-faction-icn)',

  roles: [
    { id: 'admiral', name: 'Admiral', commandAuthority: 'captain' },
    { id: 'executive-officer', name: 'Executive Officer', commandAuthority: 'officer' },
    { id: 'wing-commander', name: 'Wing Commander', commandAuthority: 'officer' },
  ],
  resources: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1, securityTeams: 9 },
  initialSurvivors: 2500,
  damageDeck: [
    { card: 'A♥', systemId: 'fighter-bay-alpha', systemName: 'Fighter Bay Alpha' },
    { card: '2♥', systemId: 'fighter-bay-bravo', systemName: 'Fighter Bay Bravo' },
    { card: '3♥', systemId: 'command-and-control', systemName: 'Command and Control' },
    { card: '4♥', systemId: 'missile-launchers', systemName: 'Missile Launchers' },
    { card: '5♥', systemId: 'point-defence-lasers', systemName: 'Point Defence Lasers' },
    {
      card: '6♥', systemId: 'armoured-hull-i', systemName: 'Armoured Hull I',
      recycleAfterResolution: true,
    },
    {
      card: '7♥', systemId: 'armoured-hull-ii', systemName: 'Armoured Hull II',
      recycleAfterResolution: true,
    },
    { card: '8♥', systemId: 'storage', systemName: 'Storage' },
    { card: '9♥', systemId: 'jump-drive', systemName: 'Jump Drive' },
    { card: '10♥', systemId: 'reactor', systemName: 'Reactor' },
    { card: 'J♥', systemId: 'construction-bay', systemName: 'Construction Bay' },
    { card: 'Q♥', systemId: 'shuttle-bay-zeta', systemName: 'Shuttle Bay Zeta' },
    { card: 'K♥', systemId: 'shuttle-bay-omega', systemName: 'Shuttle Bay Omega' },
  ],
  workspace: 'aegis',
  systems: AEGIS_ROLE_CONSOLES.admiral.systems.map(system => ({ name: system.name, card: system.card, effect: system.baseline })),
  populationTrack: {
    steps: [2500, 2000, 1500, 1250, 1000, 750, 500, 250, 0],
    thresholds: [0],
  },
  specifications: { length: '250m', tonnage: 80000, crewCapacity: 3000, passengerCapacity: 100 },
});
