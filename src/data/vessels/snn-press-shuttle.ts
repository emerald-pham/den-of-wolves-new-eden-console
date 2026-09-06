import { defineShuttle } from './templates';

export default defineShuttle({
  id: 'snn-press-shuttle',
  name: 'SNN Independent Press Shuttle',
  shortName: 'SNN Press Shuttle',
  consoleName: 'SNN — System News Network',
  operator: 'Unaffiliated Independent Press',
  operatorShort: 'SNN',
  vesselType: 'Unaffiliated Independent Press Shuttlecraft',
  description: 'Carries the System News Network press officer between ships of the survivor fleet.',
  captainRoleId: 'press-officer',

  consoleClass: 'shuttle-console--snn',
  mark: 'SNN',
  capabilities: ['newspaper-confetti'],
  initialDocking: { shipId: 'aegis', dockedAt: 'SESSION START' },
  initialVisit: {
    id: 'snn-initial-aegis-docking', shipId: 'aegis',
    action: 'docked', occurredAt: 'SESSION START',
  },
});
