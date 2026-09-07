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
  dockingEntrance: 'press',
  dockingPort: 'Civilian access hatch',
  capabilities: ['press-dispatches', 'newspaper-confetti'],
  initialDocking: { shipId: 'dione', dockedAt: 'SESSION START' },
  initialVisit: {
    id: 'snn-initial-dione-docking', shipId: 'dione',
    action: 'docked', occurredAt: 'SESSION START',
  },
});
