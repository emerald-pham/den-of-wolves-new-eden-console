import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  APPROACHING_VESSEL_COORDINATION_ACTIONS,
  APPROACHING_VESSEL_RESPONSE_CHOICES,
  type ApproachingVesselCoordinationAction,
  type ApproachingVesselResponse,
  type ApproachingVesselResponseChoice,
  type ApproachingVesselResponseInput,
} from '@/types/crisis';

export interface ApproachingVesselResponseWorkspaceViewProps {
  readonly crisisId: string;
  readonly projection: ApproachingVesselResponse | null;
  readonly canEdit: boolean;
  readonly live: boolean;
  readonly onRecord: (response: ApproachingVesselResponseInput, expectedResponseRevision: number) => Promise<void>;
}

const RESPONSE_LABELS: Readonly<Record<ApproachingVesselResponseChoice, string>> = {
  'jump-away-soon': 'Jump away as soon as possible',
  'wait-briefly-then-leave': 'Wait briefly, then leave',
  'prepare-attack-or-jump': 'Prepare to attack or jump when something arrives',
  'prepare-medical-and-wait': 'Prepare immediate medical assistance and wait as long as possible',
};
const COORDINATION_LABELS: Readonly<Record<ApproachingVesselCoordinationAction, string>> = {
  security: 'Coordinate security personnel', medical: 'Coordinate medical personnel',
  research: 'Coordinate research personnel', quarantine: 'Enact quarantine',
  'contingency-objectives': 'Set actionable objectives for stated conditions',
};

/** Actual facilitator controls and private ruling content, with injected callbacks for safe review scenes. */
export function ApproachingVesselResponseWorkspaceView({
  crisisId, projection, canEdit, live, onRecord,
}: ApproachingVesselResponseWorkspaceViewProps) {
  const projectionRef = useRef(projection);
  projectionRef.current = projection;
  const [vesselReality, setVesselReality] = useState<'real' | 'trap'>('real');
  const [responseChoices, setResponseChoices] = useState<ApproachingVesselResponseChoice[]>(['wait-briefly-then-leave']);
  const [coordinationActions, setCoordinationActions] = useState<ApproachingVesselCoordinationAction[]>([]);
  const [responseInstructions, setResponseInstructions] = useState('');
  const [quarantineInstructions, setQuarantineInstructions] = useState('');
  const [contingencyObjectives, setContingencyObjectives] = useState('');
  const [rationale, setRationale] = useState('');
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    const current = projectionRef.current;
    if (!current || current.crisisId !== crisisId) return;
    setVesselReality(current.vesselReality);
    setResponseChoices([...current.responseChoices]);
    setCoordinationActions([...current.coordinationActions]);
    setResponseInstructions(current.responseInstructions);
    setQuarantineInstructions(current.quarantineInstructions ?? '');
    setContingencyObjectives(current.contingencyObjectives ?? '');
    setRationale(current.rationale);
  }, [projection?.crisisId, projection?.revision, crisisId]);

  function toggleChoice(choice: ApproachingVesselResponseChoice, selected: boolean): void {
    setResponseChoices(current => selected ? [...current, choice] : current.filter(value => value !== choice));
  }
  function toggleCoordination(action: ApproachingVesselCoordinationAction, selected: boolean): void {
    setCoordinationActions(current => selected ? [...current, action] : current.filter(value => value !== action));
  }
  async function save(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (!canEdit || !live || pending || !responseChoices.length || !responseInstructions.trim() ||
        coordinationActions.includes('quarantine') && !quarantineInstructions.trim() ||
        coordinationActions.includes('contingency-objectives') && !contingencyObjectives.trim()) return;
    setPending(true); setStatus('');
    try {
      await onRecord({ vesselReality, responseChoices, coordinationActions, responseInstructions: responseInstructions.trim(),
        ...(coordinationActions.includes('quarantine') ? { quarantineInstructions: quarantineInstructions.trim() } : {}),
        ...(coordinationActions.includes('contingency-objectives') ? { contingencyObjectives: contingencyObjectives.trim() } : {}),
        rationale: rationale.trim(),
      }, projection?.revision ?? 0);
      setStatus('Private adjudication and public response instructions committed.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The response was not recorded.');
    } finally { setPending(false); }
  }

  return <section className="gm-crisis__response" aria-label="Approaching Vessel adjudication">
    <header>
      <p>Facilitator-private adjudication // Approaching Vessel</p>
      <h3>Response timing and pressure</h3>
      <p>Record a real ruling before any Voyage 33-0 admission. Selected response timing is an instruction; it does not start an automatic timer or alter fleet mechanics.</p>
    </header>
    {projection && projection.crisisId === crisisId && <section aria-label="Committed private adjudication">
      <h4>Current facilitator ruling</h4>
      <p>Vessel adjudication: {projection.vesselReality}</p>
      <p>Recorded against crisis revision {projection.crisisRevision} // response revision {projection.revision}</p>
      <p>Private rationale: {projection.rationale || 'No separate rationale recorded.'}</p>
    </section>}
    <form aria-label="Record Approaching Vessel response" onSubmit={event => void save(event)}>
      <label htmlFor="approaching-vessel-reality">Vessel reality
        <select id="approaching-vessel-reality" value={vesselReality} disabled={!canEdit || !live || pending}
          onChange={event => setVesselReality(event.target.value as 'real' | 'trap')}>
          <option value="real">Real arriving vessel</option><option value="trap">Trap or false report</option>
        </select>
      </label>
      <fieldset><legend>Response choice // timing and pressure</legend>
        {APPROACHING_VESSEL_RESPONSE_CHOICES.map(choice => <label key={choice}>
          <input type="checkbox" checked={responseChoices.includes(choice)} disabled={!canEdit || !live || pending}
            onChange={event => toggleChoice(choice, event.target.checked)} />{RESPONSE_LABELS[choice]}
        </label>)}
        <small>The crisis card allows these options to be combined or adapted in the written instructions.</small>
      </fieldset>
      <fieldset><legend>Coordination choices</legend>
        {APPROACHING_VESSEL_COORDINATION_ACTIONS.map(action => <label key={action}>
          <input type="checkbox" checked={coordinationActions.includes(action)} disabled={!canEdit || !live || pending}
            onChange={event => toggleCoordination(action, event.target.checked)} />{COORDINATION_LABELS[action]}
        </label>)}
      </fieldset>
      {coordinationActions.includes('quarantine') && <label htmlFor="approaching-vessel-quarantine">
        Quarantine staffing and enforcement<textarea id="approaching-vessel-quarantine" maxLength={700} value={quarantineInstructions}
          disabled={!canEdit || !live || pending} onChange={event => setQuarantineInstructions(event.target.value)} />
      </label>}
      {coordinationActions.includes('contingency-objectives') && <label htmlFor="approaching-vessel-contingencies">
        Actionable contingency objectives<textarea id="approaching-vessel-contingencies" maxLength={700} value={contingencyObjectives}
          disabled={!canEdit || !live || pending} onChange={event => setContingencyObjectives(event.target.value)} />
      </label>}
      <label htmlFor="approaching-vessel-public-instructions">Fleet response instructions<textarea
        id="approaching-vessel-public-instructions" maxLength={1200} value={responseInstructions}
        disabled={!canEdit || !live || pending} onChange={event => setResponseInstructions(event.target.value)} />
      </label>
      <label htmlFor="approaching-vessel-private-rationale">Private facilitator rationale<textarea
        id="approaching-vessel-private-rationale" maxLength={2000} value={rationale}
        disabled={!canEdit || !live || pending} onChange={event => setRationale(event.target.value)} />
      </label>
      <button type="submit" disabled={!canEdit || !live || pending || !responseChoices.length || !responseInstructions.trim() ||
        coordinationActions.includes('quarantine') && !quarantineInstructions.trim() ||
        coordinationActions.includes('contingency-objectives') && !contingencyObjectives.trim()}>
        {pending ? 'Recording…' : 'Commit adjudication and response'}
      </button>
    </form>
    {!live && <p role="status">Recording requires a fresh live facilitator session.</p>}
    {!canEdit && <p role="status">Record the response only during the current debated crisis.</p>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}
