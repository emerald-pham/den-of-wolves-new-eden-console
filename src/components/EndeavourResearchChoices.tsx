import type { ReactNode } from 'react';
import type {
  EndeavourResearchFunding,
  EndeavourResearchWorkspace,
} from '@/lib/endeavourResearchService';
import './EndeavourResearchPanel.css';

interface Props {
  readonly workspace: EndeavourResearchWorkspace | null;
  readonly selectedTrackId: string;
  readonly liveTeamPhase: boolean;
  readonly loading?: boolean;
  readonly busyFunding?: EndeavourResearchFunding | null;
  readonly pendingAttempt?: boolean;
  readonly staleBlocksNewChoice?: boolean;
  readonly notice?: string;
  readonly error?: string;
  readonly alerts?: ReactNode;
  readonly onSelectTrack: (trackId: string) => void;
  readonly onAdvance: (funding: EndeavourResearchFunding) => void;
  readonly onRefresh: () => void;
}

/** The same service-free choice view is used by the live Scientist panel and PC01's prepared scene. */
export default function EndeavourResearchChoices({
  workspace,
  selectedTrackId,
  liveTeamPhase,
  loading = false,
  busyFunding = null,
  pendingAttempt = false,
  staleBlocksNewChoice = false,
  notice = '',
  error = '',
  alerts,
  onSelectTrack,
  onAdvance,
  onRefresh,
}: Props) {
  const chosenTracks = new Set(workspace?.cadence.choices.map((choice) => choice.trackId) ?? []);
  const standardUsed = workspace?.cadence.choices.filter((choice) => choice.funding === 'standard').length ?? 0;
  const oreUsed = workspace?.cadence.choices.filter((choice) => choice.funding === 'shepherd-ore').length ?? 0;
  const selectedTrack = workspace?.tracks.find((track) => track.trackId === selectedTrackId &&
    !track.complete && !chosenTracks.has(track.trackId));
  const standardDisabled = !liveTeamPhase || !selectedTrack || standardUsed >= 3 || loading || busyFunding !== null ||
    pendingAttempt || staleBlocksNewChoice;
  const oreDisabled = !liveTeamPhase || !selectedTrack || oreUsed >= 2 ||
    (workspace?.shepherdOre ?? 0) < 5 || loading || busyFunding !== null ||
    pendingAttempt || staleBlocksNewChoice;

  return <section className="console-workspace__section endeavour-research-panel"
    aria-label="Endeavour research controls" aria-busy={loading || busyFunding !== null}>
    <div className="console-workspace__status">
      <p>Private Scientist workspace // Endeavour Team research</p>
      <p>Cycle choices: {standardUsed} of 3 standard; {oreUsed} of 2 additional.</p>
      {workspace && <p>Shepherd // {workspace.shepherdOre} ore available</p>}
      {!liveTeamPhase && workspace && <p>Research choices are available during the live Team Phase.</p>}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
    {alerts}
    {loading && <p role="status">Loading private research state…</p>}
    {!loading && !workspace && !error && <p>Research state is not available.</p>}
    {workspace && <>
      <ul aria-label="Research progress">
        {workspace.tracks.map((track) => {
          const used = chosenTracks.has(track.trackId);
          const status = track.complete ? 'Research complete.'
            : used ? 'Chosen this cycle.'
              : 'Available for a research choice.';
          return <li key={track.trackId}>
            {track.name}: {track.crossedBoxes} of {track.totalBoxes} boxes crossed;{' '}
            {track.complete ? 'no further field-upgrade cost. ' : `next field-upgrade cost is ${track.currentMaterialCost} materials. `}
            {status}
          </li>;
        })}
      </ul>
      <label className="cic-field">
        <span>Research track</span>
        <select
          value={selectedTrackId}
          onChange={(event) => onSelectTrack(event.currentTarget.value)}
          disabled={loading || busyFunding !== null || pendingAttempt || workspace.tracks.every((track) =>
            track.complete || chosenTracks.has(track.trackId))}
        >
          {workspace.tracks.map((track) => {
            const used = chosenTracks.has(track.trackId);
            return <option key={track.trackId} value={track.trackId} disabled={track.complete || used}>
              {track.name}
            </option>;
          })}
        </select>
      </label>
      {selectedTrack && <p>
        Cross the left-most research box for {selectedTrack.name}. Its next field-upgrade cost is
        {' '}{selectedTrack.currentMaterialCost} materials.
      </p>}
      <div className="console-workspace__actions">
        <button type="button" className="cic-action-button" disabled={standardDisabled}
          onClick={() => onAdvance('standard')}>
          {busyFunding === 'standard' ? 'Advancing research…' : 'Advance standard research'}
        </button>
        <button type="button" className="cic-action-button" disabled={oreDisabled}
          onClick={() => onAdvance('shepherd-ore')}>
          {busyFunding === 'shepherd-ore' ? 'Advancing research…' : 'Advance with 5 Shepherd ore'}
        </button>
        <button type="button" className="cic-text-button" disabled={loading}
          onClick={onRefresh}>
          Refresh private research
        </button>
      </div>
    </>}
  </section>;
}
