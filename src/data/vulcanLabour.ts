export interface VulcanLabourTarget {
  readonly id: string;
  readonly name: string;
}

/** Public system labels only; card identities remain server-owned. */
export const VULCAN_LABOUR_TARGETS: Readonly<Record<string, readonly VulcanLabourTarget[]>> = {
  aegis: [
    { id: 'fighter-bay-alpha', name: 'Fighter Bay Alpha' },
    { id: 'fighter-bay-bravo', name: 'Fighter Bay Bravo' },
    { id: 'command-and-control', name: 'Command and Control' },
    { id: 'missile-launchers', name: 'Missile Launchers' },
    { id: 'point-defence-lasers', name: 'Point Defence Lasers' },
    { id: 'jump-drive', name: 'Jump Drive' },
    { id: 'construction-bay', name: 'Construction Bay' },
  ],
  dione: [
    { id: 'hydroponics', name: 'Hydroponics' },
    { id: 'water-reclamation', name: 'Water Reclamation' },
    { id: 'vip-lounge', name: 'VIP Lounge' },
    { id: 'fighter-bay', name: 'Fighter Bay' },
    { id: 'jump-drive', name: 'Jump Drive' },
  ],
  icebreaker: [
    { id: 'hydroponics', name: 'Hydroponics' },
    { id: 'water-reclamation', name: 'Water Reclamation' },
    { id: 'mining-drone-control', name: 'Mining Drone Control' },
    { id: 'jump-drive', name: 'Jump Drive' },
    { id: 'ram-scoop', name: 'Ram Scoop' },
  ],
  shepherd: [
    { id: 'water-reclamation', name: 'Water Reclamation' },
    { id: 'advanced-hydroponics', name: 'Advanced Hydroponics' },
    { id: 'advanced-hydroponics-ii', name: 'Advanced Hydroponics II' },
    { id: 'jump-drive', name: 'Jump Drive' },
  ],
  quellon: [
    { id: 'hydroponics', name: 'Hydroponics' },
    { id: 'water-production', name: 'Water Production' },
    { id: 'water-production-ii', name: 'Water Production II' },
    { id: 'jump-drive', name: 'Jump Drive' },
  ],
  'refinery-124': [
    { id: 'hydroponics', name: 'Hydroponics' },
    { id: 'water-reclamation', name: 'Water Reclamation' },
    { id: 'fuel-refinery', name: 'Fuel Refinery' },
    { id: 'fuel-refinery-ii', name: 'Fuel Refinery II' },
    { id: 'fighter-bay', name: 'Fighter Bay' },
    { id: 'jump-drive', name: 'Jump Drive' },
  ],
  capybara: [
    { id: 'advanced-hydroponics', name: 'Advanced Hydroponics' },
    { id: 'water-production', name: 'Water Production' },
    { id: 'scrap-refinery', name: 'Scrap Refinery' },
    { id: 'jump-drive', name: 'Jump Drive' },
  ],
};

export const VULCAN_ADDITIONAL_LABOUR_CONSOLES = [
  'additional-labour-1', 'additional-labour-2',
] as const;
