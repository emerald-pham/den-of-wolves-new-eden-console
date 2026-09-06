export interface RoleProcedure { readonly name: string; readonly effect: string }

const engineering: readonly RoleProcedure[] = [
  { name: 'Maintenance coordination', effect: 'Review storage, rations, unrest, reactor charges and shuttle refuelling with the ship’s team in maintenance order.' },
  { name: 'Console upgrades', effect: 'Coordinate research and material costs with the Shepherd Scientist. Resolve upgrades and repairs at the table.' },
];

export function proceduresForRole(roleId: string): readonly RoleProcedure[] {
  if (roleId.includes('engineer')) return engineering;
  if (roleId.includes('captain')) return [
    { name: 'Ship policy', effect: 'Coordinate resource priorities and the maintenance cycle with your team.' },
    { name: 'Fleet diplomacy', effect: 'Liaise with other ships and represent your survivors in fleet decisions.' },
  ];
  return ROLE_PROCEDURES[roleId] ?? [];
}

const ROLE_PROCEDURES: Readonly<Record<string, readonly RoleProcedure[]>> = {
  'dione-president': [
    { name: 'Political capital', effect: 'Track 0–8 at the table. Resolving a crisis grants 1 political capital, plus the resolution’s consequences.' },
    { name: 'Presidential address', effect: 'At the start of each Team Phase, address the fleet and invite up to one extra player to speak. Announce new laws and binding resolutions at the next Team Phase.' },
    { name: 'Presidential visit', effect: 'During Coordination, spend 1 political capital to lower one ship’s unrest by 1.' },
  ],
  'icebreaker-miner': [
    { name: 'Mining production', effect: 'Coordinate Mining Drone Control and the Ram Scoop with reactor charging and the fleet’s jump plan.' },
    { name: 'Ore supply', effect: 'Coordinate ore supply with Refinery 124 so the fleet can produce jump fuel.' },
  ],
  'shepherd-scientist': [
    { name: 'Research programme', effect: 'During the Team Phase, advance up to 3 research types by one box each. Choose each type at most once per turn.' },
    { name: 'Additional research', effect: 'Up to twice per turn, spend 5 ore from Shepherd’s hold for an extra research choice.' },
    { name: 'Construction costs', effect: 'Pay the left-most unlocked material cost from Shepherd’s hold. Research progress and built devices are tracked at the table.' },
    { name: 'Reactor / Jump Drive', effect: 'Material tracks: Reactor 8 / 7 / 6 / 5 / 4; Jump Drive 14 / 10 / 6 / 4 / 3.' },
    { name: 'Food and water research', effect: 'Hydroponics and Water Reclamation: 8 / 4 / 2 / 1 / 1. Advanced Hydroponics and Water Production: 18 / 14 / 10 / 6 / 3.' },
    { name: 'Industrial research', effect: 'Fuel Refinery: 14 / 12 / 8 / 6 / 5. Mining Drone Control: 18 / 14 / 10 / 6 / 4. Ram Scoop: 14 / 12 / 10 / 8 / 5.' },
    { name: 'Defence research', effect: 'Command and Control: 12 / 9 / 7 / 5 / 6. Point Defence Lasers: 12 / 11 / 8 / 5 / 2. Missile Launchers: 12 / 10 / 7 / 5 / 3.' },
    { name: 'ECM Device', effect: 'Material track: 18 / 13 / 9 / 7 / 5. Once built, reduce Pursuit by 3.' },
    { name: 'Wolf Agent Detector', effect: 'Material track: 18 / 12 / 7 / 5. Once built, test up to 3 players per turn with about 80% accuracy; resolve privately with a facilitator.' },
  ],
  'quellon-explorer': [
    { name: 'Exploration coordination', effect: 'Coordinate scouting information and away missions with the fleet. Resolve mission opportunities at the table.' },
    { name: 'Water supply', effect: 'Coordinate Quellon’s water production with ships that need it for rations and hydroponics.' },
  ],
  'refinery-124-pdf-colonel': [
    { name: 'Fighter launch', effect: 'A charged, undamaged Fighter Bay permits a fighter wing to launch during a Wolf Attack.' },
    { name: 'Fighter combat', effect: 'Medium range: each fighter shifts one hostile targeting number by +1 or −1 with wraparound, or rolls one die for 1 damage on 5+. Short range: roll up to one die per fighter; 1 damage on 3+, lose a fighter on 1 or 2. Assign short-range damage to hostile fighter wings first.' },
    { name: 'Boarding defence', effect: 'Each defending security team rolls one die: 1 destroys the security team; 4+ destroys a boarding party. Each surviving boarding party deals 1 damage.' },
  ],
  'capybara-recycler': [
    { name: 'Scrap allocation', effect: 'Coordinate scrap spending between food, water and material production. The Scrap Refinery can instead generate 1 scrap when charged.' },
    { name: 'Fleet supply', effect: 'Help supply the fleet with resources and coordinate where they are needed.' },
  ],
  'executive-officer': [
    { name: 'Enriched warheads', effect: 'At the start of a Wolf Attack, spend 5 AEGIS ore: Missile Launchers gain +1 long-range damage and hit on 4+ at medium range.' },
    { name: 'Boarding defence', effect: 'Re-roll up to 3 dice to repel boarders.' },
  ],
};

export const EXECUTIVE_SYSTEMS = [
  { id: 'command-and-control', name: 'Command and Control', effect: 'After targeting, redirect one Wolf ship to AEGIS. Upgraded: at the end of the attack, choose up to one ship to take 1 less damage. If damaged: cannot be used.' },
  { id: 'fighter-bay-alpha', name: 'Fighter Bay Alpha', effect: 'While charged, launch a fighter wing. If damaged: cannot launch fighters.' },
  { id: 'fighter-bay-bravo', name: 'Fighter Bay Bravo', effect: 'While charged, launch a fighter wing. If damaged: cannot launch fighters.' },
  { id: 'missile-launchers', name: 'Missile Launchers', effect: 'Charged: long range deals 2 damage to one target; medium range rolls 4 dice, each 5+ deals 1 damage to a different target. Upgraded: +1 long-range damage and +1 medium-range die. If damaged: unusable.' },
  { id: 'point-defence-lasers', name: 'Point Defence Lasers', effect: 'Charged: roll 2 dice at medium range, each 4+ deals 1 damage to a different target; short range rolls 2 dice, each 2+ deals 1 damage to a different target. Upgraded: +1 target. If damaged: unusable.' },
];
