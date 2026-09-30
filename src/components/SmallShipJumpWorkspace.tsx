import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SmallCraftJumpId,
  SmallShipJumpChargeCommand,
  SmallShipJumpCommand,
  SmallShipJumpWorkspaceProjection,
} from '@/lib/smallShipJumpService';
import {
  chargeSmallShipJumpDrive,
  getSmallShipJumpWorkspace,
  jumpSmallShip,
} from '@/lib/smallShipJumpService';

interface SmallShipJumpWorkspaceProps {
  readonly smallShipId: SmallCraftJumpId;
}

type PendingCharge = SmallShipJumpChargeCommand;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The server did not confirm this Jump Drive action.';
}

function requestId(): string {
  return window.crypto.randomUUID();
}

function SmallShipJumpWorkspace({ smallShipId }: SmallShipJumpWorkspaceProps) {
  const [projection, setProjection] = useState<SmallShipJumpWorkspaceProjection>();
  const [selectedDestination, setSelectedDestination] = useState('');
  const [pendingJump, setPendingJump] = useState<SmallShipJumpCommand>();
  const [pendingCharge, setPendingCharge] = useState<PendingCharge>();
  const [resultMessage, setResultMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const next = await getSmallShipJumpWorkspace(smallShipId);
      setProjection(next);
      setSelectedDestination('');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [smallShipId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getSmallShipJumpWorkspace(smallShipId).then((next) => {
      if (!active) return;
      setProjection(next);
      setError('');
    }).catch((cause: unknown) => {
      if (active) setError(errorMessage(cause));
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [smallShipId]);

  const destination = useMemo(
    () => projection?.knownDestinations?.find((choice) => choice.coordinate === selectedDestination),
    [projection?.knownDestinations, selectedDestination],
  );
  const hasHostFuel = destination !== undefined && (projection?.hostFuel ?? -1) >= destination.fuelCost;
  const canCharge = projection?.viewer === 'captain' && projection.hostShipId !== null &&
    projection.phase === 'team' && projection.cycleStep === 4 &&
    projection.cycleTurn === projection.currentTurn && projection.charged === false &&
    Number.isSafeInteger(projection.cycleRevision) &&
    (projection.cycleCharges?.length ?? 0) < 2 &&
    !(projection.cycleCharges ?? []).includes('jump-drive');
  const canJump = projection?.viewer === 'captain' && projection.phase === 'coordination' &&
    projection.hostShipId !== null && projection.currentCoordinate !== null && projection.charged === true &&
    destination !== undefined && hasHostFuel && Number.isSafeInteger(projection.cycleRevision);

  const submitJump = useCallback(async (command?: SmallShipJumpCommand) => {
    if (busy) return;
    const next = command ?? (projection && destination && projection.currentCoordinate && projection.hostShipId
      ? {
        smallShipId,
        hostShipId: projection.hostShipId,
        destination: destination.coordinate,
        expectedOrigin: projection.currentCoordinate,
        expectedMovementRevision: projection.movementRevision,
        expectedDockingRevision: projection.dockingRevision,
        expectedCycleRevision: projection.cycleRevision ?? -1,
        requestId: requestId(),
      }
      : undefined);
    if (!next) return;
    setBusy(true);
    setError('');
    setResultMessage('Awaiting the authoritative Jump Drive result…');
    setPendingJump(next);
    try {
      const result = await jumpSmallShip(next, command !== undefined);
      if (result.status === 'stale') {
        setResultMessage('The host position or craft revisions changed. Refresh the projection before choosing another route.');
        setPendingJump(undefined);
        await reload();
      } else if (result.status === 'committed' || result.status === 'replayed') {
        setResultMessage(`${result.status === 'replayed' ? 'Replayed' : 'Committed'} jump to ${String(result.destination)}; host fuel ${String(result.remainingHostFuel)} remaining. The craft is now detached.`);
        setPendingJump(undefined);
        await reload();
      } else {
        setResultMessage('The server returned an unrecognized movement status. Refresh before trying again.');
        setPendingJump(undefined);
        await reload();
      }
    } catch (cause) {
      setError(errorMessage(cause));
      setResultMessage('The result is uncertain. Retry this exact request to safely resolve its receipt.');
    } finally {
      setBusy(false);
    }
  }, [busy, destination, projection, reload, smallShipId]);

  const submitCharge = useCallback(async (charge?: PendingCharge) => {
    if (busy || !projection || !Number.isSafeInteger(projection.cycleRevision)) return;
    const next = charge ?? {
      requestId: requestId(),
      expectedCycleRevision: projection.cycleRevision!,
      consoles: [...(projection.cycleCharges ?? []), 'jump-drive'],
    };
    setBusy(true);
    setError('');
    setResultMessage('Requesting Team Phase reactor charge…');
    setPendingCharge(next);
    try {
      const result = await chargeSmallShipJumpDrive(smallShipId, next, charge !== undefined);
      const record = typeof result === 'object' && result !== null ? result as Record<string, unknown> : {};
      if (record.status === 'stale') {
        setResultMessage('The craft cycle changed. Refresh before charging again.');
        setPendingCharge(undefined);
      } else {
        setResultMessage('Jump Drive charge recorded for this cycle.');
        setPendingCharge(undefined);
      }
      await reload();
    } catch (cause) {
      setError(errorMessage(cause));
      setResultMessage('The charge result is uncertain. Retry the same request to safely resolve it.');
    } finally {
      setBusy(false);
    }
  }, [busy, projection, reload, smallShipId]);

  const vesselName = smallShipId === 'gorgoneion' ? 'Gorgoneion' : 'Base Capybara';
  return (
    <section className="console-workspace extra-ship-workspace__procedure" aria-label="Small-craft Jump Drive workspace">
      <header className="console-workspace__header">
        <p className="eyebrow">{vesselName} // Jump Drive // server authority</p>
        <h3>Small-craft FTL procedure</h3>
      </header>
      <p>
        Charge during Team Phase, then jump during Coordination. Route choices come only from this Captain’s known chart nodes.
        Host fuel is spent only after the server validates the route and confirms it remains known to this Captain. The host pays 1 / 1 / 2 fuel for a short / medium / long jump.
      </p>
      <p>Successful jump detaches the craft at its arrival coordinate. Re-docking requires an active host at that same coordinate.</p>
      {loading && <p className="console-workspace__status" role="status">Loading current server movement projection…</p>}
      {error && <p className="console-workspace__error" role="alert">{error}</p>}
      {resultMessage && <p className="console-workspace__status" role="status">{resultMessage}</p>}
      {projection && projection.viewer === 'gm' && (
        <p>Facilitator movement projection: {projection.currentCoordinate ?? 'coordinate unavailable'} // revision {projection.movementRevision}.</p>
      )}
      {projection && projection.viewer === 'captain' && (
        <>
          <dl className="console-workspace__telemetry">
            <div><dt>Current coordinate</dt><dd>{projection.currentCoordinate ?? 'Unavailable'}</dd></div>
            <div><dt>Docked host</dt><dd>{projection.hostShipId ?? 'Detached'}</dd></div>
            <div><dt>Host fuel</dt><dd>{projection.hostFuel ?? 'No docked host'}</dd></div>
            <div><dt>Cycle / phase</dt><dd>{projection.currentTurn} // {projection.phase}</dd></div>
            <div><dt>Jump Drive</dt><dd>{projection.charged ? 'Charged this cycle' : 'Not charged this cycle'}</dd></div>
          </dl>
          {canCharge && (
            <button type="button" className="console-workspace__button" disabled={busy || pendingCharge !== undefined} onClick={() => void submitCharge()}>
              Charge Jump Drive
            </button>
          )}
          {pendingCharge && (
            <button type="button" className="console-workspace__button" disabled={busy} onClick={() => void submitCharge(pendingCharge)}>
              Retry exact charge
            </button>
          )}
          {projection.hostShipId && projection.currentCoordinate && (
            <label>
              Known destination
              <select
                value={selectedDestination}
                disabled={busy || pendingJump !== undefined || projection.phase !== 'coordination' || projection.charged !== true}
                onChange={(event) => setSelectedDestination(event.currentTarget.value)}
              >
                <option value="">Select a known destination</option>
                {(projection.knownDestinations ?? []).map((choice) => (
                  <option key={choice.coordinate} value={choice.coordinate}>
                    {choice.coordinate} // {choice.length} // {choice.fuelCost} host fuel
                  </option>
                ))}
              </select>
            </label>
          )}
          {projection.hostShipId === null && (
            <p>The craft is independent at its recorded arrival coordinate. Ask the facilitator to dock it with a co-located active host before its next jump.</p>
          )}
          {destination && !hasHostFuel && <p role="alert">The current host fuel ledger cannot fund this route.</p>}
          <button type="button" className="console-workspace__button" disabled={!canJump || busy || pendingJump !== undefined} onClick={() => void submitJump()}>
            Execute jump
          </button>
          {pendingJump && (
            <button type="button" className="console-workspace__button" disabled={busy} onClick={() => void submitJump(pendingJump)}>
              Retry exact jump
            </button>
          )}
          <button type="button" className="console-workspace__button" disabled={busy} onClick={() => void reload()}>
            Refresh movement projection
          </button>
          <details>
            <summary>Arrival knowledge recorded for this Captain</summary>
            <p>{projection.arrivalCoordinates?.length ? projection.arrivalCoordinates.join(' // ') : 'No private jump arrivals recorded.'}</p>
          </details>
        </>
      )}
    </section>
  );
}

export default SmallShipJumpWorkspace;
