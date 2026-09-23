import { useEffect, useState } from 'react';
import { findShip } from '@/data/ships';
import { phaseForSession } from '@/lib/turnPhase';
import { repairMaliades, resolveMaliadesMedium, resolveMaliadesShort, type MaliadesMediumChoice } from '@/lib/maliadesService';
import { useSessionStore } from '@/store/useSessionStore';
import type { ShuttleControlEntry, ShuttleDocking } from '@/types/game';

interface Props {
  readonly control: ShuttleControlEntry;
  readonly docking?: ShuttleDocking | undefined;
  readonly fuelled: boolean;
}

/** The Dione Engineer's live Maliades controls. Every mutation is server-authoritative. */
export default function MaliadesPanel({ control, docking, fuelled }: Props) {
  const session = useSessionStore((state) => state.session)!;
  const me = useSessionStore((state) => state.me)!;
  const [shiftTarget, setShiftTarget] = useState('');
  const [shift, setShift] = useState<-1 | 1>(1);
  const [mediumTarget, setMediumTarget] = useState('');
  const [shortTargets, setShortTargets] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const state = session.maliadesState;
  const phase = phaseForSession(session);
  const cycle = session.currentTurn ?? 0;
  const phaseOpen = session.phase === 'active' && cycle >= 1 && phase?.turn === cycle &&
    phase.airspace.state === 'restricted' && !phase.timerPause;
  const isHolder = control.shuttleId === 'maliades' && control.ownerRoleId === 'dione-engineer' &&
    control.holderUid === me.uid && me.activeConsoleRoleId === 'dione-engineer';
  const targetShiftChoice: MaliadesMediumChoice | undefined = shiftTarget.trim()
    ? { kind: 'target-shift', targetId: shiftTarget.trim(), shift } : undefined;
  const attackChoice: MaliadesMediumChoice | undefined = mediumTarget.trim()
    ? { kind: 'attack', targetId: mediumTarget.trim() } : undefined;
  const mediumChoices = [targetShiftChoice, attackChoice].filter((choice): choice is MaliadesMediumChoice => choice !== undefined);
  const selectedShortTargets = shortTargets.map((target) => target.trim()).filter(Boolean);
  const hostName = docking ? findShip(docking.shipId)?.name ?? docking.shipId : undefined;
  const canOperate = Boolean(state?.launched && !state.destroyed && isHolder && phaseOpen && !busy);
  const canRepair = Boolean(state?.launched && state.damage > 0 && !state.destroyed && isHolder && phaseOpen &&
    fuelled && docking && !busy);

  useEffect(() => {
    setShiftTarget('');
    setMediumTarget('');
    setShortTargets(['', '']);
    setStatus('');
  }, [state?.revision, cycle, control.revision, docking?.shipId]);

  async function operateMedium(): Promise<void> {
    if (!canOperate || mediumChoices.length === 0) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await resolveMaliadesMedium(cycle, state?.revision ?? 0, mediumChoices);
      setStatus(`${result.status === 'replayed' ? 'Medium request replayed' : 'Medium resolution committed'} // cycle ${result.cycle} // damage ${result.state.damage}/3.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Maliades Medium resolution failed.');
    } finally {
      setBusy(false);
    }
  }

  async function operateShort(): Promise<void> {
    if (!canOperate || selectedShortTargets.length === 0) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await resolveMaliadesShort(cycle, state?.revision ?? 0, selectedShortTargets);
      setStatus(`${result.status === 'replayed' ? 'Short request replayed' : 'Short resolution committed'} // cycle ${result.cycle} // damage ${result.state.damage}/3.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Maliades Short resolution failed.');
    } finally {
      setBusy(false);
    }
  }

  async function repair(): Promise<void> {
    if (!canRepair || !docking || !state) return;
    setBusy(true);
    setStatus('');
    try {
      const result = await repairMaliades(cycle, state.revision, docking.shipId, 1);
      setStatus(`${result.status === 'replayed' ? 'Repair request replayed' : 'Repair committed'} // ${result.hostShipId} // damage ${result.state.damage}/3.`);
    } catch (cause) {
      setStatus(cause instanceof Error ? cause.message : 'Maliades repair failed.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="console-workspace__section shuttle-control" aria-label="Maliades operations">
    <p className="console-workspace__eyebrow">Escort fighter // authoritative state</p>
    <h3>Maliades operations</h3>
    <p>Damage // {state?.damage ?? 0} / 3 {state?.destroyed ? '// destroyed' : '// operational'}</p>
    {!state?.launched && <p>Launch Maliades from the Dione Engineer console before operating it.</p>}
    {!isHolder && <p>Only the current Dione Engineer holding Maliades may resolve its actions.</p>}
    {!phaseOpen && <p>Wolf attack actions and Team Phase repairs require restricted airspace in the current cycle.</p>}
    {docking ? <p>Docked host // {hostName} // fuel // {fuelled ? 'fuelled' : 'unfuelled'}</p> : <p>Maliades is not docked with an active host.</p>}

    <fieldset disabled={!canOperate}>
      <legend>Medium range // choose up to one shift and one attack</legend>
      <label>Target for +1 / −1 shift
        <input value={shiftTarget} onChange={(event) => setShiftTarget(event.target.value)} placeholder="Wolf target ID" />
      </label>
      <label>Shift
        <select value={shift} onChange={(event) => setShift(Number(event.target.value) === -1 ? -1 : 1)}>
          <option value="1">+1 (6 wraps to 1)</option>
          <option value="-1">−1 (1 wraps to 6)</option>
        </select>
      </label>
      <label>Attack target
        <input value={mediumTarget} onChange={(event) => setMediumTarget(event.target.value)} placeholder="Wolf target ID" />
      </label>
      <button className="cic-action-button" type="button" disabled={mediumChoices.length === 0 || busy} onClick={() => void operateMedium()}>
        Resolve Medium range
      </button>
    </fieldset>

    <fieldset disabled={!canOperate}>
      <legend>Short range // choose up to two distinct targets</legend>
      {shortTargets.map((target, index) => <label key={index}>Target {index + 1}
        <input value={target} onChange={(event) => setShortTargets((current) => current.map((value, item) => item === index ? event.target.value : value))} placeholder="Wolf target ID" />
      </label>)}
      <button className="cic-action-button" type="button" disabled={selectedShortTargets.length === 0 || busy} onClick={() => void operateShort()}>
        Resolve Short range
      </button>
    </fieldset>

    <fieldset disabled={!canRepair}>
      <legend>Team Phase repair</legend>
      <p>Repair one damage for one material while fuelled and docked.</p>
      <button className="cic-action-button" type="button" disabled={busy} onClick={() => void repair()}>
        Repair 1 damage
      </button>
    </fieldset>
    {status && <p role="status">{status}</p>}
  </section>;
}
