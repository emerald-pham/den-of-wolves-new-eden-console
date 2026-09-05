import {
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
  type Unsubscribe,
  type Firestore,
} from 'firebase/firestore';
import { app } from './firebase';
import { useEmulators } from './firebaseConfig';
import type { GameSession, GmInstance, Player, Seat } from '@/types/game';

let firestore: Firestore | undefined;

export function db(): Firestore {
  if (!firestore) {
    // The persisted Zustand snapshot and short-lived outbox own offline state;
    // Firestore's listener reconnect supplies fresh server authority.
    firestore = getFirestore(app());
    if (useEmulators) connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
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
  return {
    id,
    name: data.name as string,
    joinCode: data.joinCode as string,
    phase: data.phase as GameSession['phase'],
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
