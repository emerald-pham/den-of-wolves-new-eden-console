/**
 * Server-owned initial shuttle manifest. The Union craft are intentionally
 * absent from the 20/21-player default roster: their printed sheets do not say
 * which optional Union pairing begins with each craft, so a facilitator
 * enables the paired Union role and establishes docking when it is in play.
 */
export const INITIAL_SHUTTLE_DOCKINGS = [
  { shuttleId: 'snn-press-shuttle', shipId: 'dione', dockedAt: 'SESSION START' },
  { shuttleId: 'starlight', shipId: 'aegis', dockedAt: 'SESSION START' },
  { shuttleId: 'pallas', shipId: 'aegis', dockedAt: 'SESSION START' },
  { shuttleId: 'philia', shipId: 'dione', dockedAt: 'SESSION START' },
  { shuttleId: 'maliades', shipId: 'dione', dockedAt: 'SESSION START' },
  { shuttleId: 'highwall', shipId: 'icebreaker', dockedAt: 'SESSION START' },
  { shuttleId: 'blacksmith', shipId: 'icebreaker', dockedAt: 'SESSION START' },
  { shuttleId: 'macaw', shipId: 'capybara', dockedAt: 'SESSION START' },
  { shuttleId: 'boa', shipId: 'capybara', dockedAt: 'SESSION START' },
  { shuttleId: 'endeavour', shipId: 'shepherd', dockedAt: 'SESSION START' },
  { shuttleId: 'black-sheep', shipId: 'shepherd', dockedAt: 'SESSION START' },
  { shuttleId: 'hummingbird', shipId: 'quellon', dockedAt: 'SESSION START' },
  { shuttleId: 'condor', shipId: 'quellon', dockedAt: 'SESSION START' },
  { shuttleId: 'chacau', shipId: 'refinery-124', dockedAt: 'SESSION START' },
  { shuttleId: 'chepu', shipId: 'refinery-124', dockedAt: 'SESSION START' },
];

export const INITIAL_SHUTTLE_VISITS = INITIAL_SHUTTLE_DOCKINGS.map((docking) => ({
  id: docking.shuttleId === 'snn-press-shuttle'
    ? 'snn-initial-dione-docking'
    : `${docking.shuttleId}-initial-${docking.shipId}-docking`,
  shuttleId: docking.shuttleId,
  shipId: docking.shipId,
  action: 'docked' as const,
  occurredAt: 'SESSION START',
}));
