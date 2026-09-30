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
import SmallShipJumpPanel from './SmallShipJumpPanel';

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

  return (
    <SmallShipJumpPanel
      smallShipId={smallShipId}
      projection={projection}
      loading={loading}
      busy={busy}
      selectedDestination={selectedDestination}
      pendingJump={pendingJump !== undefined}
      pendingCharge={pendingCharge !== undefined}
      error={error}
      resultMessage={resultMessage}
      onDestinationChange={setSelectedDestination}
      onCharge={() => void submitCharge()}
      onRetryCharge={() => { if (pendingCharge) void submitCharge(pendingCharge); }}
      onJump={() => void submitJump()}
      onRetryJump={() => { if (pendingJump) void submitJump(pendingJump); }}
      onRefresh={() => void reload()}
    />
  );
}

export default SmallShipJumpWorkspace;
