const CORE_18 = [
  'admiral', 'executive-officer', 'wing-commander',
  'dione-captain', 'dione-engineer', 'dione-president',
  'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner',
  'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist',
  'quellon-captain', 'quellon-engineer', 'quellon-explorer',
  'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel',
] as const;

const A = 'admiral';
const W = 'wing-commander';
const QR = 'joint-engineering-quellon-refinery';
const SI = 'joint-engineering-shepherd-icebreaker';

const MATRIX_PRESETS: Readonly<Record<number, readonly string[]>> = {
  8: [A, 'icebreaker-miner', 'shepherd-scientist', 'quellon-explorer', 'refinery-124-pdf-colonel', QR, SI],
  9: [A, 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-explorer', 'refinery-124-pdf-colonel', QR],
  10: [A, 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  11: [A, W, 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  12: [A, W, 'dione-engineer', 'dione-president', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  13: [A, 'executive-officer', W, 'dione-engineer', 'dione-president', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-engineer', 'shepherd-scientist', 'quellon-engineer', 'quellon-explorer', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  14: [A, W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-miner', 'shepherd-captain', 'shepherd-scientist', 'quellon-captain', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-pdf-colonel', QR, SI],
  15: [A, 'executive-officer', W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-miner', 'shepherd-captain', 'shepherd-scientist', 'quellon-captain', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-pdf-colonel', QR, SI],
  16: [A, W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist', 'quellon-captain', 'quellon-engineer', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  17: [A, 'executive-officer', W, 'dione-captain', 'dione-president', 'icebreaker-captain', 'icebreaker-engineer', 'icebreaker-miner', 'shepherd-captain', 'shepherd-engineer', 'shepherd-scientist', 'quellon-captain', 'quellon-engineer', 'quellon-explorer', 'refinery-124-captain', 'refinery-124-engineer', 'refinery-124-pdf-colonel'],
  18: CORE_18,
  19: [...CORE_18, 'press-officer'],
  20: [...CORE_18, 'capybara-captain', 'capybara-recycler'],
  21: [...CORE_18, 'capybara-captain', 'capybara-recycler', 'press-officer'],
};

export const MIN_PLAYER_PRESET = 8;
export const MAX_PLAYER_PRESET = 21;

export function recommendedRoleIds(playerCount: number): readonly string[] {
  return MATRIX_PRESETS[playerCount] ?? MATRIX_PRESETS[MAX_PLAYER_PRESET] ?? [];
}
