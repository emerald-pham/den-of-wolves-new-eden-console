import { SHIPS } from '@/data/ships';
import type { Player, WolfAttackDecisionActor, WolfAttackDecisionSummary, WolfAttackDeclarationState } from '@/types/game';
import './GmWolfDecisionSummary.css';

interface Props {
  readonly summary?: WolfAttackDecisionSummary;
  readonly currentStep: WolfAttackDeclarationState['currentStep'];
  readonly players: readonly Player[];
  readonly available: boolean;
}

const STATUS = {
  pending: 'Choice pending', committed: 'Choice committed', 'no-commander': 'No Wolf Commander configured',
  unavailable: 'Unavailable', 'waiting-for-force-field': 'Waiting for the Gorgoneion Captain',
  redirected: 'Redirect committed', passed: 'Passed', 'not-needed': 'No choice needed',
  'waiting-for-commander': 'Waiting for the Wolf Commander', selected: 'Protection selected',
  'targets-required': 'Hit targets required', 'auto-passed': 'Automatic pass committed',
} as const;

const REASON = {
  'no-configured-commander': 'No Wolf Commander configured',
  'waiting-for-force-field': 'Waiting for the Gorgoneion Captain',
  'missing-targeting-receipt': 'The targeting receipt is waiting for a server refresh',
  'no-configured-executive-officer': 'No Executive Officer configured',
  'executive-officer-disconnected': 'The Executive Officer must reconnect',
  'no-current-executive-officer': 'No Executive Officer at the current AEGIS command post',
  'waiting-for-commander': 'Waiting for the Wolf Commander',
  'no-targets': 'No eligible targets', uncharged: 'Command and Control is uncharged',
  damaged: 'Command and Control is damaged', 'damage-unknown': 'Command and Control damage is awaiting a server refresh',
  'no-current-captain': 'No current Gorgoneion Captain',
  'ambiguous-current-captain': 'The current Gorgoneion Captain assignment needs reconciliation',
  'gorgoneion-not-admitted': 'Gorgoneion is not admitted to this fleet',
  'projector-not-ready': 'The force-field projector is not ready',
  'captain-berth-unavailable': 'The Captain is not at the current Gorgoneion command post',
  'not-recorded': 'No force-field choice is recorded',
  'automatic-progress-pending': 'The server is committing legal progress',
  'malformed-current-range': 'Current range details are awaiting a server refresh',
  'no-current-crew-actor': 'No current entitled crew member',
} as const;

const RANGE = { 'long-range': 'Long Range', 'medium-range': 'Medium Range', 'short-range': 'Short Range' } as const;
const shipName = (id: string): string => SHIPS.find(ship => ship.id === id)?.name ?? 'Current target';

function Actors({ actors, players }: Readonly<{ actors: readonly WolfAttackDecisionActor[]; players: readonly Player[] }>) {
  return <>{actors.map(actor => <p className="gm-wolf-decisions__actor" key={actor.uid}>
    {players.find(player => player.uid === actor.uid)?.displayName.trim() || 'Assigned player'}
    {' // '}{actor.connected ? 'Connected at last server update' : 'Reconnect pending'}
  </p>)}</>;
}

/** Read-only display of the strict, GM-only server decision projection. */
export default function GmWolfDecisionSummary({ summary, currentStep, players, available }: Props) {
  const range = summary?.range?.range === currentStep ? summary.range : undefined;
  const boarding = currentStep === 'boarding' || currentStep === 'resolved' ? summary?.boarding : undefined;
  return <section className="gm-wolf-decisions" aria-label="Current attack choices">
    <h3>Current attack choices</h3>
    {!available ? <p>Reconnect for current attack choices.</p> : !summary ?
      <p>Current decision details are waiting for a server refresh.</p> : <>
        <p className="gm-wolf-decisions__presence">Presence reflects the last server update.</p>
        <div role="group" aria-label="Wolf Commander decisions">
          <strong>Wolf Commander</strong><p>{STATUS[summary.commander.status]}</p>
          {summary.commander.reason && <p>{REASON[summary.commander.reason]}</p>}
          <Actors actors={summary.commander.actors} players={players} />
        </div>
        {summary.enrichedWarheads && <div role="group" aria-label="Enriched warhead decisions">
          <strong>AEGIS Executive Officer // Enriched warheads</strong>
          <p>{summary.enrichedWarheads.status === 'enriched' ? 'Five ore paid once // active for this attack' : STATUS[summary.enrichedWarheads.status]}</p>
          <Actors actors={summary.enrichedWarheads.actors} players={players} />
        </div>}
        <div role="group" aria-label="Command and Control decisions">
          <strong>AEGIS Executive Officer // Command and Control</strong><p>{STATUS[summary.commandAndControl.status]}</p>
          {summary.commandAndControl.reason && <p>{REASON[summary.commandAndControl.reason]}</p>}
          <Actors actors={summary.commandAndControl.actors} players={players} />
        </div>
        <div role="group" aria-label="Gorgoneion force-field decisions">
          <strong>Gorgoneion Captain // Force field</strong>
          <p>{summary.forceField.status === 'selected' && summary.forceField.targetShipId ?
            `Protecting ${shipName(summary.forceField.targetShipId)}` : STATUS[summary.forceField.status]}</p>
          {summary.forceField.reason && <p>{REASON[summary.forceField.reason]}</p>}
          {summary.forceField.actor && <Actors actors={[summary.forceField.actor]} players={players} />}
        </div>
        {range && <div role="group" aria-label={`${RANGE[range.range]} decisions`}>
          <strong>{RANGE[range.range]} // Executive Officer</strong><p>{STATUS[range.status]}</p>
          {range.selectedActionCount !== undefined && range.actionCount !== undefined &&
            <p>{range.selectedActionCount} selected actions // {range.actionCount} available</p>}
          {range.reason && <p>{REASON[range.reason]}</p>}
          <Actors actors={range.actors} players={players} />
        </div>}
        {boarding && <div role="group" aria-label="Boarding decisions">
          <strong>Boarding Action // Target crew</strong>
          <p>{boarding.status === 'resolved' ? 'Resolution committed' : 'Current crew choices'}</p>
          {boarding.targets.map(target => <div className="gm-wolf-decisions__boarding" key={target.targetShipId}>
            <p>{shipName(target.targetShipId)} // {target.status === 'pending' ? 'Crew choice pending' : STATUS[target.status]}
              {' // '}{target.boardingParties} boarding {target.boardingParties === 1 ? 'party' : 'parties'}
              {target.securityTeams !== undefined && ` // ${target.securityTeams} security ${target.securityTeams === 1 ? 'team' : 'teams'}`}
            </p>
            {target.reason && <p>{REASON[target.reason]}</p>}
            <Actors actors={target.actors} players={players} />
          </div>)}
        </div>}
      </>}
  </section>;
}
