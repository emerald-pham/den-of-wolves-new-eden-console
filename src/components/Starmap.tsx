import type { CSSProperties } from 'react';
import {
  EXPLORATION_SITES,
  STAR_CHART_CONNECTIONS,
  STAR_CHART_IDS,
  STAR_CHART_SYSTEMS,
  siteForCoordinate,
  systemForCoordinate,
  type StarChartId,
  type StarSystem,
} from '@/data/starChart';

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
  readonly className?: string;
}

type StarmapNodeStyle = CSSProperties & {
  readonly '--starmap-depth': string;
  readonly '--starmap-faction': string;
};

function systemAccessibleName(
  system: StarSystem,
  chart: StarChartId,
  fleetLabels: readonly string[],
  shipMode: boolean,
  visited: boolean,
): string {
  if (shipMode) {
    const state = visited ? ' // Previous fix' : system.coordinate === '0000' ? ' // Origin' : '';
    return `System ${system.coordinate}${state}`;
  }
  const code = system.chartCodes[chart];
  const chartLabel = code === null
    ? 'Start'
    : `${code} // ${EXPLORATION_SITES[code].name}` +
      (EXPLORATION_SITES[code].candidate ? ' // New Eden candidate' : '');
  const fleetLabel = fleetLabels.length > 0
    ? ` // Fleet ${fleetLabels.length === 1 ? 'ship' : 'ships'}: ${fleetLabels.join(', ')}`
    : '';
  return `System ${system.coordinate} // ${chartLabel}${fleetLabel}`;
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
  className = '',
}: StarmapProps) {
  const shipMode = mode === 'ship';
  const selectedSystem = systemForCoordinate(selectedCoordinate);
  const selectedSite = shipMode ? undefined : siteForCoordinate(selectedCoordinate, chart);
  const selectedFleet = fleetMarkers.filter((marker) => marker.coordinate === selectedCoordinate);
  const selectedNeighbors = selectedSystem?.neighbors ?? [];
  const selectedLabel = selectedSystem
    ? `System ${selectedSystem.coordinate}`
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
            {STAR_CHART_IDS.map((chartId) => (
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
                const from = systemForCoordinate(connection[0]);
                const to = systemForCoordinate(connection[1]);
                if (!from || !to) return null;
                const isSelectedRoute = connection[0] === selectedCoordinate ||
                  connection[1] === selectedCoordinate;
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
                const code = shipMode ? null : system.chartCodes[chart];
                const site = shipMode || code === null ? undefined : EXPLORATION_SITES[code];
                const markers = fleetMarkers.filter((marker) => marker.coordinate === system.coordinate);
                const isCurrentShip = shipMode && markers.length > 0;
                const isVisited = shipMode && visitedCoordinates.includes(system.coordinate);
                const markerColor = markers[0]?.color ?? 'var(--cic-cyan)';
                const style: StarmapNodeStyle = {
                  left: `${system.position.x}%`,
                  top: `${system.position.y}%`,
                  '--starmap-depth': `${system.pursuitDistance}`,
                  '--starmap-faction': markerColor,
                };
                const nodeLabel = systemAccessibleName(
                  system,
                  chart,
                  markers.map((marker) => marker.label),
                  shipMode,
                  isVisited,
                );
                const nodeChildren = <>
                  <span className="starmap__node-coordinate">{system.coordinate}</span>
                  <span className="starmap__node-code">{shipMode ? (isCurrentShip ? 'SHIP' : isVisited ? 'FROM' : 'FIX') : code ?? 'START'}</span>
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
                  'data-selected': String(selectedCoordinate === system.coordinate),
                  'data-fleet-count': String(markers.length),
                  'data-system-coordinate': system.coordinate,
                  'data-current-ship': isCurrentShip ? 'true' : undefined,
                  'data-visited-coordinate': isVisited ? system.coordinate : undefined,
                  style,
                };
                return shipMode ? (
                  <span key={system.coordinate} role="img" {...nodeData}>{nodeChildren}</span>
                ) : (
                  <button
                    key={system.coordinate}
                    type="button"
                    aria-pressed={selectedCoordinate === system.coordinate}
                    onClick={() => onSystemSelect?.(system.coordinate)}
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
