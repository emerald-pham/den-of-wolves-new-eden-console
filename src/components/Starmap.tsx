import type { CSSProperties } from 'react';
import GalacticOrientationCompass from './GalacticOrientationCompass';
import {
  coordinateForNode,
  STAR_CHART_CONNECTIONS,
  STAR_CHART_SYSTEMS,
  systemForCoordinate,
  type StarSystem,
} from '@/data/starChartTopology';

export type StarChartId = 'A' | 'B' | 'C';
export interface OrganiserSiteProjection {
  readonly code: string;
  readonly name: string;
  readonly candidate: boolean;
  readonly summary: string;
}

export interface StarmapFleetMarker {
  readonly id: string;
  readonly label: string;
  readonly coordinate: string;
  readonly color: string;
}

export interface StarmapProps {
  readonly chart: StarChartId;
  readonly onChartChange?: (chart: StarChartId) => void;
  readonly selectedCoordinate: string;
  readonly onSystemSelect?: (coordinate: string) => void;
  readonly fleetMarkers?: readonly StarmapFleetMarker[];
  /** Ship consoles use the same topology without exposing organiser site data. */
  readonly mode?: 'gm' | 'ship';
  readonly visitedCoordinates?: readonly string[];
  readonly knownCoordinates?: readonly string[];
  /** Opaque browser node ID to the coordinates entitled to this view. */
  readonly knownSystems?: Readonly<Record<string, string>>;
  readonly organiserSites?: Readonly<Record<string, OrganiserSiteProjection>>;
  readonly className?: string;
}

type StarmapNodeStyle = CSSProperties & {
  readonly '--starmap-depth': string;
  readonly '--starmap-faction': string;
};

function systemAccessibleName(
  system: StarSystem,
  fleetLabels: readonly string[],
  shipMode: boolean,
  visited: boolean,
  known: boolean,
  coordinate: string | undefined,
  organiserSites: Readonly<Record<string, OrganiserSiteProjection>> | undefined,
): string {
  if (shipMode) {
    if (!known || !coordinate) return 'Unknown system // coordinates unavailable';
    const state = visited ? ' // Previous fix' : coordinate === '0000' ? ' // Origin' : '';
    return `System ${coordinate}${state}`;
  }
  const site = coordinate ? organiserSites?.[coordinate] : undefined;
  const chartLabel = site
    ? `${site.code || 'START'}${site.name ? ` // ${site.name}` : ''}${site.candidate ? ' // New Eden candidate' : ''}`
    : coordinate === '0000' ? 'START // Fleet departure point' : 'System data pending';
  const fleetLabel = fleetLabels.length > 0
    ? ` // Fleet ${fleetLabels.length === 1 ? 'ship' : 'ships'}: ${fleetLabels.join(', ')}`
    : '';
  return `${coordinate ? `System ${coordinate}` : `System ${system.id}`} // ${chartLabel}${fleetLabel}`;
}

function depthLabel(distance: number): string {
  return distance === 0 ? 'Start system' : `-${distance} pursuit distance`;
}

function linkKey([from, to]: readonly [string, string]): string {
  return `${from}-${to}`;
}

function fleetFixLabel(fleetMarkers: readonly StarmapFleetMarker[]): string {
  const coordinates = [...new Set(fleetMarkers.map((marker) => marker.coordinate))];
  if (coordinates.length === 0) return 'FLEET FIX // 0000';

  const label = coordinates.length === 1 ? 'FLEET FIX' : 'FLEET FIXES';
  const plotted = fleetMarkers.length > 1 ? ` // ${fleetMarkers.length} ships plotted` : '';
  return `${label} // ${coordinates.join(' // ')}${plotted}`;
}

function fleetPlotLabel(fleetMarkers: readonly StarmapFleetMarker[]): string {
  const count = fleetMarkers.length;
  return `Fleet plot // ${count} ${count === 1 ? 'ship' : 'ships'} plotted`;
}

function shipFixLabel(
  fleetMarkers: readonly StarmapFleetMarker[],
  visitedCoordinates: readonly string[],
): string {
  const current = fleetMarkers[0]?.coordinate ?? '0000';
  const places = visitedCoordinates.length > 0 ? visitedCoordinates.join(' // ') : 'NONE';
  return `SHIP FIX // ${current} // PLACES YOU HAVE COME FROM // ${places}`;
}

export default function Starmap({
  chart,
  onChartChange,
  selectedCoordinate,
  onSystemSelect,
  fleetMarkers = [],
  mode = 'gm',
  visitedCoordinates = [],
  knownCoordinates = ['0000'],
  knownSystems = {},
  organiserSites,
  className = '',
}: StarmapProps) {
  const shipMode = mode === 'ship';
  const selectedSystem = systemForCoordinate(selectedCoordinate, knownSystems);
  const selectedSite = shipMode ? undefined : organiserSites?.[selectedCoordinate];
  const selectedFleet = fleetMarkers.filter((marker) => marker.coordinate === selectedCoordinate);
  const selectedNeighbors = selectedSystem?.neighbors
    .map((nodeId) => coordinateForNode(nodeId, knownSystems))
    .filter((coordinate): coordinate is string => typeof coordinate === 'string') ?? [];
  const selectedLabel = selectedSystem
    ? `System ${selectedCoordinate}`
    : `Unmapped coordinate ${selectedCoordinate}`;

  return (
    <section
      className={`starmap ${className}`.trim()}
      role="region"
      aria-label={shipMode ? 'Ship navigation map' : '3D starmap'}
      data-chart={chart}
      data-view-mode={mode}
    >
      <header className="starmap__header">
        <div>
          <p className="cic-overline">{shipMode ? 'Ship navigation map // ship fix' : 'Navigation reference // organiser view'}</p>
          <h2>{shipMode ? 'Ship navigation map' : '3D starmap'}</h2>
        </div>
        <p className="starmap__chart-readout">
          {shipMode ? `Current ship // ${fleetMarkers[0]?.coordinate ?? selectedCoordinate}` : `Chart ${chart} // labelled overlay`}
        </p>
      </header>

      <div className="starmap__instrument-strip" role="group" aria-label="Starmap instrument status">
        <p>
          <span className="starmap__instrument-label">Plot status</span>
          <strong>{fleetMarkers.length > 0 ? `${shipMode ? 'Ship' : 'Fleet'} fix acquired` : `Awaiting ${shipMode ? 'ship' : 'fleet'} fix`}</strong>
        </p>
        <p>
          <span className="starmap__instrument-label">{shipMode ? 'Current ship' : 'Fleet plot'}</span>
          <strong>{shipMode ? (fleetMarkers[0]?.coordinate ?? selectedCoordinate) : fleetPlotLabel(fleetMarkers)}</strong>
        </p>
        <p>
          <span className="starmap__instrument-label">{shipMode ? 'Places you have come from' : 'Display depth'}</span>
          <strong>{shipMode ? (visitedCoordinates.length > 0 ? visitedCoordinates.join(' // ') : 'None recorded') : 'Perspective overlay // display only'}</strong>
        </p>
      </div>

      <div className="starmap__ticks cic-ticks" aria-hidden="true" />

      <div className="starmap__toolbar">
        {!shipMode && onChartChange && (
          <div className="starmap__chart-selector" role="group" aria-label="Organiser chart">
            <span className="starmap__toolbar-label">Organiser chart</span>
            {(['A', 'B', 'C'] as const).map((chartId) => (
              <button
                className="starmap__chart-button cic-action-button"
                key={chartId}
                type="button"
                aria-pressed={chart === chartId}
                onClick={() => onChartChange(chartId)}
              >
                Chart {chartId}
              </button>
            ))}
          </div>
        )}
        <p className="starmap__ground-truth">22 systems // 40 jump links</p>
      </div>

      <div className="starmap__body">
        <div className="starmap__viewport">
          <div className="starmap__viewport-chrome" aria-hidden="true">
            <span>DRADIS // tactical plot</span>
            <span>Depth // pursuit</span>
          </div>
          <div className="starmap__scanline" aria-hidden="true" />
          <div className="starmap__scene">
            <div className="starmap__depth-plane" aria-hidden="true" />
            <svg
              className="starmap__network"
              viewBox="0 0 100 100"
              role="presentation"
              aria-hidden="true"
              focusable="false"
            >
              {STAR_CHART_CONNECTIONS.map((connection) => {
                const from = STAR_CHART_SYSTEMS.find((system) => system.id === connection[0]);
                const to = STAR_CHART_SYSTEMS.find((system) => system.id === connection[1]);
                if (!from || !to) return null;
                const isSelectedRoute = selectedSystem !== undefined &&
                  (connection[0] === selectedSystem.id || connection[1] === selectedSystem.id);
                return (
                  <line
                    className={`starmap__link${isSelectedRoute ? ' starmap__link--selected' : ''}`}
                    data-route-state={isSelectedRoute ? 'selected' : 'network'}
                    key={linkKey(connection)}
                    x1={from.position.x}
                    y1={from.position.y}
                    x2={to.position.x}
                    y2={to.position.y}
                  />
                );
              })}
            </svg>

            <div className="starmap__nodes">
              {STAR_CHART_SYSTEMS.map((system) => {
                const coordinate = coordinateForNode(system.id, knownSystems);
                const known = !shipMode || (coordinate !== undefined && knownCoordinates.includes(coordinate));
                const site = shipMode || !coordinate ? undefined : organiserSites?.[coordinate];
                const markers = coordinate
                  ? fleetMarkers.filter((marker) => marker.coordinate === coordinate)
                  : [];
                const isCurrentShip = shipMode && markers.length > 0;
                const isVisited = shipMode && coordinate !== undefined && visitedCoordinates.includes(coordinate);
                const markerColor = markers[0]?.color ?? 'var(--cic-cyan)';
                const style: StarmapNodeStyle = {
                  left: `${system.position.x}%`,
                  top: `${system.position.y}%`,
                  '--starmap-depth': `${system.pursuitDistance}`,
                  '--starmap-faction': markerColor,
                };
                const nodeLabel = systemAccessibleName(
                  system,
                  markers.map((marker) => marker.label),
                  shipMode,
                  isVisited,
                  known,
                  coordinate,
                  organiserSites,
                );
                const nodeChildren = <>
                  <span className="starmap__node-coordinate">{shipMode && !known ? 'UNKNOWN' : coordinate ?? 'UNKNOWN'}</span>
                  <span className="starmap__node-code">{shipMode ? (isCurrentShip ? 'SHIP' : isVisited ? 'FROM' : known ? 'FIX' : 'UNKNOWN') : site?.code || 'START'}</span>
                  {markers.length > 0 && (
                    <span className="starmap__node-fleet" aria-hidden="true">
                      {shipMode ? 'CURRENT SHIP' : `FLEET ${markers.length}`}
                    </span>
                  )}
                </>;
                const nodeData = {
                  className: `starmap__node${isCurrentShip ? ' starmap__node--current-ship' : ''}${isVisited ? ' starmap__node--visited' : ''}`,
                  'aria-label': nodeLabel,
                  'data-candidate': String(site?.candidate === true),
                  'data-selected': String(selectedCoordinate === coordinate),
                  'data-fleet-count': String(markers.length),
                  'data-system-id': system.id,
                  'data-system-coordinate': coordinate,
                  'data-current-ship': isCurrentShip ? 'true' : undefined,
                  'data-visited-coordinate': isVisited ? coordinate : undefined,
                  'data-known-coordinate': known ? coordinate : undefined,
                  style,
                };
                return shipMode ? (
                  <span key={system.id} role="img" {...nodeData}>{nodeChildren}</span>
                ) : (
                  <button
                    key={system.id}
                    type="button"
                    aria-pressed={selectedCoordinate === coordinate}
                    onClick={() => coordinate && onSystemSelect?.(coordinate)}
                    {...nodeData}
                  >
                    {nodeChildren}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="starmap__projection-note">
            3D projection // printed topology and links remain fixed // perspective depth is display only
          </p>
        </div>

        <section className="starmap__readout cic-frame" role="region" aria-label={shipMode ? 'Ship fix readout' : 'Selected system readout'} aria-live="polite">
          <p className="cic-overline">Selected fix</p>
          {shipMode ? (
            <>
              <h3>Current ship // {fleetMarkers[0]?.coordinate ?? selectedCoordinate}</h3>
              <p className="starmap__readout-site">Current ship // {fleetMarkers[0]?.coordinate ?? selectedCoordinate}</p>
              <p className="starmap__readout-summary">Places you have come from // {visitedCoordinates.length > 0 ? visitedCoordinates.join(' // ') : 'None recorded'}</p>
              <dl>
                <div><dt>Current ship</dt><dd>{fleetMarkers[0]?.coordinate ?? selectedCoordinate}</dd></div>
                <div><dt>Places you have come from</dt><dd>{visitedCoordinates.length > 0 ? visitedCoordinates.join(' // ') : 'None recorded'}</dd></div>
              </dl>
              <GalacticOrientationCompass className="starmap__compass" />
            </>
          ) : selectedSystem ? (
            <>
              <h3>{selectedLabel}</h3>
              <p className="starmap__readout-site">
                {selectedSite
                  ? `${selectedSite.code} // ${selectedSite.name}${selectedSite.candidate ? ' // New Eden candidate' : ''}`
                  : 'START // Fleet departure point'}
              </p>
              {selectedSite && (
                <p className="starmap__readout-summary">{selectedSite.summary}</p>
              )}
              <dl>
                <div>
                  <dt>Chart site</dt>
                  <dd>{selectedSite?.code ?? 'START'}</dd>
                </div>
                <div>
                  <dt>Pursuit depth</dt>
                  <dd>{depthLabel(selectedSystem.pursuitDistance)}</dd>
                </div>
                <div>
                  <dt>Jump links</dt>
                  <dd>{selectedNeighbors.length > 0 ? selectedNeighbors.join(' // ') : 'None'}</dd>
                </div>
                <div>
                  <dt>Fleet fix</dt>
                  <dd>{selectedFleet.length > 0 ? selectedFleet.map((marker) => marker.label).join(' // ') : 'No fleet ship here'}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="starmap__readout-empty">
              No printed chart node matches this four-digit fix.
            </p>
          )}
        </section>
      </div>

      <p className="starmap__fleet-fix" aria-live="polite">
        {shipMode ? shipFixLabel(fleetMarkers, visitedCoordinates) : fleetFixLabel(fleetMarkers)}
      </p>
    </section>
  );
}
