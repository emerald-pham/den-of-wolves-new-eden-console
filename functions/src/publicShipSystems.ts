/**
 * Already-public system identities for strict repair/movement validation.
 * Matches src/data/vessels and the public AEGIS console identities; contains
 * no card identities, multiplicity, draw order, names, or damage outcomes.
 * Keep the parser/draw compatibility checks when changing either catalog.
 */
export const PUBLIC_SHIP_SYSTEM_IDS: Readonly<Record<string, readonly string[]>> = {
  'aegis': [
    'armoured-hull-i', 'armoured-hull-ii', 'command-and-control', 'construction-bay', 'fighter-bay-alpha', 'fighter-bay-bravo', 'jump-drive', 'missile-launchers', 'point-defence-lasers', 'reactor', 'shuttle-bay-omega', 'shuttle-bay-zeta', 'storage',
  ],
  'dione': [
    'fighter-bay', 'hydroponics', 'jump-drive', 'reactor', 'shuttle-bay', 'storage', 'vip-lounge', 'water-reclamation',
  ],
  'icebreaker': [
    'hydroponics', 'jump-drive', 'mining-drone-control', 'ram-scoop', 'reactor', 'shuttle-bay', 'storage', 'water-reclamation',
  ],
  'capybara': [
    'advanced-hydroponics', 'jump-drive', 'reactor', 'scrap-refinery', 'shuttle-bay', 'storage', 'water-production',
  ],
  'shepherd': [
    'advanced-hydroponics', 'advanced-hydroponics-ii', 'jump-drive', 'reactor', 'shuttle-bay', 'storage', 'water-reclamation',
  ],
  'quellon': [
    'hydroponics', 'jump-drive', 'reactor', 'shuttle-bay', 'storage', 'water-production', 'water-production-ii',
  ],
  'refinery-124': [
    'fighter-bay', 'fuel-refinery', 'fuel-refinery-ii', 'hydroponics', 'jump-drive', 'reactor', 'shuttle-bay', 'storage', 'water-reclamation',
  ],
};
