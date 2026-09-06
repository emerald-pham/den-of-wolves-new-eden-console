import {
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  limit,
  query,
  where,
  type DocumentData,
  type Unsubscribe,
  type Firestore,
} from 'firebase/firestore';
import { app } from './firebase';
import { emulatorPorts, useEmulators } from './firebaseConfig';
import type { DamageDraw, GameSession, GmInstance, Player, Seat, SessionEvent } from '@/types/game';
import { DEFAULT_ACTIVE_ROLE_IDS } from '@/data/roles';
import { INITIAL_SHUTTLE_DOCKINGS, INITIAL_SHUTTLE_VISITS } from '@/data/shuttles';
import { INITIAL_SHIP_GALACTIC_COORDINATES } from '@/data/ships';
import { shipResources, shipUnrest } from '@/data/resources';
import { INITIAL_SHIP_SURVIVORS } from '@/data/shipPopulation';

let firestore: Firestore | undefined;

export function db(): Firestore {
  if (!firestore) {
    // The persisted Zustand snapshot and short-lived outbox own offline state;
    // Firestore's listener reconnect supplies fresh server authority.
    firestore = getFirestore(app());
    if (useEmulators) connectFirestoreEmulator(firestore, '127.0.0.1', emulatorPorts.firestore);
  }
  return firestore;
}

function iso(value: unknown): string {
  if (
    typeof value === 'object' && value !== null && 'toDate' in value &&
    typeof value.toDate === 'function'
  ) return (value.toDate() as Date).toISOString();
  return new Date().toISOString();
}

function sessionFrom(id: string, data: DocumentData): GameSession {
  const dradisContactTriggeredAt = data.dradisContactTriggeredAt;
  return {
    id,
    name: data.name as string,
    joinCode: data.joinCode as string,
    phase: data.phase as GameSession['phase'],
    currentTurn: Number.isSafeInteger(data.currentTurn) && data.currentTurn >= 1 ? data.currentTurn as number : 1,
    capybaraEnabled: data.capybaraEnabled !== false,
    dioneEnabled: data.dioneEnabled !== false,
    shipGalacticCoordinates:
      typeof data.shipGalacticCoordinates === 'object' && data.shipGalacticCoordinates !== null
        ? { ...INITIAL_SHIP_GALACTIC_COORDINATES, ...data.shipGalacticCoordinates as Record<string, string> }
        : INITIAL_SHIP_GALACTIC_COORDINATES,
    fleetRedAlert: data.fleetRedAlert ?? { active: false, revision: 0 },
    pressDispatch: data.pressDispatch ?? { text: 'SNN // Your Trusted Partner', revision: 0 },
    maintenanceCycles: data.maintenanceCycles ?? {},
    shuttleCargo: data.shuttleCargo ?? {},
    shuttleFuelled: data.shuttleFuelled ?? {},
    shipUpgrades: data.shipUpgrades ?? {},
    shipResources: shipResources(data.shipResources),
    shipDamage: typeof data.shipDamage === 'object' && data.shipDamage !== null
      ? data.shipDamage as NonNullable<GameSession['shipDamage']>
      : {},
    shipUnrest: shipUnrest(data.shipUnrest),
    shipSurvivors: typeof data.shipSurvivors === 'object' && data.shipSurvivors !== null
      ? data.shipSurvivors as NonNullable<GameSession['shipSurvivors']>
      : INITIAL_SHIP_SURVIVORS,
    populationAlerts: typeof data.populationAlerts === 'object' && data.populationAlerts !== null
      ? data.populationAlerts as NonNullable<GameSession['populationAlerts']> : {},
    unrestAlerts:
      typeof data.unrestAlerts === 'object' && data.unrestAlerts !== null
        ? data.unrestAlerts as NonNullable<GameSession['unrestAlerts']>
        : {},
    gmControlsLocked: data.gmControlsLocked === true,
    activeRoleIds: Array.isArray(data.activeRoleIds)
      ? data.activeRoleIds as string[]
      : DEFAULT_ACTIVE_ROLE_IDS,
    shuttleDockings: Array.isArray(data.shuttleDockings)
      ? data.shuttleDockings as NonNullable<GameSession['shuttleDockings']>
      : INITIAL_SHUTTLE_DOCKINGS,
    shuttleVisitLog: Array.isArray(data.shuttleVisitLog)
      ? data.shuttleVisitLog as NonNullable<GameSession['shuttleVisitLog']>
      : INITIAL_SHUTTLE_VISITS,
    confettiUsedShipIds: Array.isArray(data.confettiUsedShipIds)
      ? data.confettiUsedShipIds as string[]
      : [],
    ...(dradisContactTriggeredAt && typeof dradisContactTriggeredAt.toDate === 'function'
      ? { dradisContactTriggeredAt: iso(dradisContactTriggeredAt) }
      : {}),
    ownerUid: data.ownerUid as string,
    createdAt: iso(data.createdAt),
    updatedAt: iso(data.updatedAt),
  };
}

function playerFrom(sessionId: string, uid: string, data: DocumentData): Player {
  return {
    uid,
    sessionId,
    displayName: data.displayName as string,
    role: data.role as Player['role'],
    seatId: (data.seatId as string | null) ?? null,
    activeConsoleRoleId: (data.activeConsoleRoleId as string | null) ?? null,
    joinedAt: iso(data.joinedAt),
  };
}

function seatFrom(sessionId: string, id: string, data: DocumentData): Seat {
  return {
    id,
    sessionId,
    label: data.label as string,
    factionId: (data.factionId as string | null) ?? null,
    status: data.status as Seat['status'],
    holderUid: (data.holderUid as string | null) ?? null,
    claimedAt: data.claimedAt ? iso(data.claimedAt) : null,
  };
}

function gmInstanceFrom(sessionId: string, id: string, data: DocumentData): GmInstance {
  return {
    id,
    sessionId,
    uid: data.uid as string,
    name: data.name as string,
    deviceLabel: data.deviceLabel as string,
    claimedAt: iso(data.claimedAt),
  };
}

export interface SessionStateHandlers {
  readonly onSession: (session: GameSession) => void;
  readonly onPlayer: (player: Player) => void;
  readonly onSeats: (seats: readonly Seat[]) => void;
  readonly onError: () => void;
}

/** Keep the local snapshot current while Firestore handles reconnect/cache replay. */
export function subscribeSessionState(
  sessionId: string,
  uid: string,
  handlers: SessionStateHandlers,
): Unsubscribe {
  const database = db();
  const unsubscribes = [
    onSnapshot(doc(database, `sessions/${sessionId}`), (snapshot) => {
      if (snapshot.exists()) handlers.onSession(sessionFrom(snapshot.id, snapshot.data()));
      else handlers.onError();
    }, handlers.onError),
    onSnapshot(doc(database, `sessions/${sessionId}/players/${uid}`), (snapshot) => {
      if (snapshot.exists() && snapshot.get('connected') === true) {
        handlers.onPlayer(playerFrom(sessionId, uid, snapshot.data()));
      } else handlers.onError();
    }, handlers.onError),
    onSnapshot(collection(database, `sessions/${sessionId}/seats`), (snapshot) => {
      handlers.onSeats(snapshot.docs.map((seat) => seatFrom(sessionId, seat.id, seat.data())));
    }, handlers.onError),
  ];
  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

export function subscribeGmInstances(
  sessionId: string,
  onInstances: (instances: readonly GmInstance[]) => void,
  onError: () => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db(), `sessions/${sessionId}/gmInstances`), orderBy('claimedAt', 'asc')),
    (snapshot) => onInstances(snapshot.docs.map((instance) =>
      gmInstanceFrom(sessionId, instance.id, instance.data()))),
    onError,
  );
}

export function subscribeConnectedPlayers(
  sessionId: string,
  onPlayers: (players: readonly Player[]) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/players`),
      where('connected', '==', true),
    ),
    (snapshot) => onPlayers(snapshot.docs.map((player) =>
      playerFrom(sessionId, player.id, player.data()))),
    onError,
  );
}

export function subscribeShipConfetti(
  sessionId: string,
  shipId: string,
  onPop: (sourceShipId: string, actorRoleName?: string, actorName?: string) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  let initial = true;
  let lastSignal: string | null = null;
  return onSnapshot(
    doc(db(), `sessions/${sessionId}/shipConfetti/${shipId}`),
    (snapshot) => {
      const signal = snapshot.exists() ? iso(snapshot.get('createdAt')) : null;
      const sourceShipId = snapshot.exists() ? String(snapshot.get('shipId')) : shipId;
      const actorRoleName = snapshot.exists() ? String(snapshot.get('actorRoleName')) : '';
      const actorName = snapshot.exists() ? String(snapshot.get('actorName')) : '';
      if (initial) {
        initial = false;
        lastSignal = signal;
        if (signal && Date.now() - Date.parse(signal) < 5_000) {
          onPop(sourceShipId, actorRoleName, actorName);
        }
        return;
      }
      if (signal && signal !== lastSignal) onPop(sourceShipId, actorRoleName, actorName);
      lastSignal = signal;
    },
    onError,
  );
}

export function subscribeSessionEvents(
  sessionId: string,
  onEvents: (events: readonly SessionEvent[]) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/events`),
      orderBy('createdAt', 'desc'),
      limit(30),
    ),
    (snapshot) => onEvents(snapshot.docs.flatMap<SessionEvent>((event) => {
      const data = event.data();
      if (data.type === 'fullscreen-alert') return [{
        id: event.id,
        sessionId,
        type: 'fullscreen-alert' as const,
        sourceRoleName: data.sourceRoleName as string,
        message: data.message as string,
        createdAt: iso(data.createdAt),
      }];
      if (data.type === 'maintenance' && (data.action === 'begin' || data.action === 'end')) return [{
        id: event.id,
        sessionId,
        type: 'maintenance' as const,
        shipId: data.shipId as string,
        shipName: data.shipName as string,
        action: data.action,
        createdAt: iso(data.createdAt),
      }];
      if (data.type !== 'ship-confetti') return [];
      return [{
        id: event.id,
        sessionId,
        type: 'ship-confetti' as const,
        shipId: data.shipId as string,
        shipName: data.shipName as string,
        actorName: data.actorName as string,
        actorRoleName: data.actorRoleName as string,
        createdAt: iso(data.createdAt),
      }];
    })),
    onError,
  );
}

export function subscribeDamageDraws(
  sessionId: string,
  onDraws: (draws: readonly DamageDraw[]) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/damageDraws`),
      orderBy('createdAt', 'desc'),
      limit(30),
    ),
    (snapshot) => onDraws(snapshot.docs.flatMap<DamageDraw>((draw) => {
      const data = draw.data();
      if (data.type === 'ship-destroyed') return [{
        id: draw.id,
        sessionId,
        type: 'ship-destroyed' as const,
        shipId: data.shipId as string,
        createdAt: iso(data.createdAt),
      }];
      if (data.type !== 'ship-damage') return [];
      return [{
        id: draw.id,
        sessionId,
        type: 'ship-damage' as const,
        shipId: data.shipId as string,
        card: data.card as string,
        systemId: data.systemId as string,
        systemName: data.systemName as string,
        recycled: data.recycled === true,
        createdAt: iso(data.createdAt),
      }];
    })),
    onError,
  );
}
