import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firestore';
import { parsePressLogEntry, type PressLogEntry } from './pressLogState';

const PRESS_LOG_LIMIT = 50;

/** Read the server-authorized Press inbox; cached private entries are never rendered. */
export function subscribePressLog(
  sessionId: string,
  onEntries: (entries: readonly PressLogEntry[]) => void,
  onError: () => void = () => undefined,
): Unsubscribe {
  let active = true;
  const unsubscribe = onSnapshot(
    query(
      collection(db(), `sessions/${sessionId}/pressLog`),
      orderBy('recordedAt', 'desc'),
      limit(PRESS_LOG_LIMIT),
    ),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!active) return;
      if (snapshot.metadata.fromCache) {
        onEntries([]);
        return;
      }
      onEntries(snapshot.docs.flatMap((entry) => {
        const parsed = parsePressLogEntry(entry.id, entry.data());
        return parsed ? [parsed] : [];
      }));
    },
    () => {
      if (active) onError();
    },
  );
  return () => {
    active = false;
    unsubscribe();
  };
}
