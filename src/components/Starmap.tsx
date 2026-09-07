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
  readonly className?: string;
}

type StarmapNodeStyle = CSSProperties & { readonly '--starmap-depth': string };

function systemAccessibleName(system: StarSystem, chart: StarChartId): string {
  const code = system.chartCodes[chart];
  if (code === null) return `System ${system.coordinate} // Start`;
  const site = EXPLORATION_SITES[code];
  return `System ${system.coordinate} // ${code} // ${site.name}` +
    (site.candidate ? ' // New Eden candidate' : '');
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

export default function Starmap({
  chart,
  onChartChange,
  selectedCoordinate,
  onSystemSelect,
  fleetMarkers = [],
  className = '',
}: StarmapProps) {
  const selectedSystem = systemForCoordinate(selectedCoordinate);
  const selectedSite = siteForCoordinate(selectedCoordinate, chart);
  const selectedFleet = fleetMarkers.filter((marker) => marker.coordinate === selectedCoordinate);
  const selectedNeighbors = selectedSystem?.neighbors ?? [];
  const selectedLabel = selectedSystem
    ? `System ${selectedSystem.coordinate}`
    : `Unmapped coordinate ${selectedCoordinate}`;

  return (
    <section
      className={`starmap ${className}`.trim()}
      role="region"
      aria-label="3D starmap"
      data-chart={chart}
    >
      <header className="starmap__header">
        <div>
          <p className="cic-overline">Navigation reference // organiser view</p>
          <h2>3D starmap</h2>
        </div>
        <p className="starmap__chart-readout">Chart {chart} // labelled overlay</p>
      </header>

      <div className="starmap__toolbar">
        {onChartChange && (
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
          <div className="starmap__scene">
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
                return (
                  <line
                    className="starmap__link"
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
                const code = system.chartCodes[chart];
                const site = code === null ? undefined : EXPLORATION_SITES[code];
                const markers = fleetMarkers.filter((marker) => marker.coordinate === system.coordinate);
                const style: StarmapNodeStyle = {
                  left: `${system.position.x}%`,
                  top: `${system.position.y}%`,
                  '--starmap-depth': `${system.pursuitDistance}`,
                };
                return (
                  <button
                    className="starmap__node"
                    key={system.coordinate}
                    type="button"
                    aria-label={systemAccessibleName(system, chart)}
                    aria-pressed={selectedCoordinate === system.coordinate}
                    data-candidate={String(site?.candidate === true)}
                    data-selected={String(selectedCoordinate === system.coordinate)}
                    data-system-coordinate={system.coordinate}
                    style={style}
                    onClick={() => onSystemSelect?.(system.coordinate)}
                  >
                    <span className="starmap__node-coordinate">{system.coordinate}</span>
                    <span className="starmap__node-code">{code ?? 'START'}</span>
                    {markers.length > 0 && (
                      <span className="starmap__node-fleet" aria-hidden="true">
                        FLEET {markers.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="starmap__projection-note">
            3D projection // printed topology and links remain fixed // perspective depth is display only
          </p>
        </div>

        <section className="starmap__readout cic-frame" role="region" aria-label="Selected system readout" aria-live="polite">
          <p className="cic-overline">Selected fix</p>
          <h3>{selectedLabel}</h3>
          {selectedSystem ? (
            <>
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
        {fleetFixLabel(fleetMarkers)}
      </p>
    </section>
  );
}
