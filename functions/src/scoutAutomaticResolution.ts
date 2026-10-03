import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { resolveCommittedScoutRequest, type ScoutMapCommit } from './scoutResultCallable';

/** Durable server continuation of an immutable, authorized scouting choice. */
export function createAutomaticScoutResolver(commitMapKnowledge: ScoutMapCommit) {
  return onDocumentWritten({
    document: 'sessions/{sessionId}/scoutRequests/{requestId}',
    region: 'us-central1',
    retry: true,
  }, async event => {
    if (!event.data?.after.exists || event.data.before.exists) return;
    await resolveCommittedScoutRequest(commitMapKnowledge,
      event.params.sessionId, event.params.requestId);
  });
}
