import { findVessel } from '@/data/ships';

interface Props {
  readonly groupId: string;
  readonly currentCoordinate: string;
  readonly vesselIds?: readonly string[] | undefined;
  readonly pursuitValue?: number | undefined;
}

function vesselLabel(vesselId: string): string {
  return findVessel(vesselId)?.shortName ?? vesselId.toUpperCase();
}

export default function FleetGroupContext({
  groupId,
  currentCoordinate,
  vesselIds,
  pursuitValue,
}: Props) {
  const roster = vesselIds?.length
    ? vesselIds.map(vesselLabel).join(' // ')
    : 'Roster unavailable';
  const pursuit = pursuitValue === undefined
    ? 'Pursuit unavailable'
    : `${pursuitValue} / 10`;

  return <section
    className="fleet-group-context cic-frame"
    role="region"
    aria-label="Current fleet group and location"
    data-fleet-group-id={groupId}
  >
    <header>
      <p className="cic-overline">GROUP-LOCAL NAVIGATION</p>
      <h3>{groupId.toUpperCase()}</h3>
    </header>
    <dl>
      <div><dt>Current location</dt><dd>{currentCoordinate}</dd></div>
      <div><dt>Ships in this group</dt><dd>{roster}</dd></div>
      <div><dt>Wolf pursuit</dt><dd>{pursuit}</dd></div>
      <div><dt>Ordinary communications</dt><dd>This fleet group only</dd></div>
      <div><dt>Map knowledge</dt><dd>Current group and entitled ship only</dd></div>
    </dl>
  </section>;
}
