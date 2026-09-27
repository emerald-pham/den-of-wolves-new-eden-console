import { httpsCallable } from 'firebase/functions';
import { useSessionStore } from '@/store/useSessionStore';
import type {
  PendingScoutRequestView, PrivateScoutResultView, ScoutDiscoveryNoteView, ScoutReportView,
} from '@/components/ScoutResultPanels';
import { functions } from './firebase';
import { scoutEntitlementDefinition, type ScoutEntitlementId } from './scoutRequestAuthority';
import {
  captureSessionAuthority, isCurrentSessionAuthority, requireFreshSessionAuthority,
} from './sessionMutationAuthority';

type RecordValue = Record<string, unknown>;

function record(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exact(value: RecordValue, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key));
}

function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function coordinate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}$/.test(value);
}

function source(value: unknown): value is ScoutEntitlementId {
  return typeof value === 'string' && scoutEntitlementDefinition(value as ScoutEntitlementId) !== undefined;
}

function fact(value: unknown, expectedCoordinate: string): PrivateScoutResultView['systemFact'] | null {
  if (!record(value) || !exact(value, ['coordinate', 'code', 'title']) ||
      value.coordinate !== expectedCoordinate || typeof value.code !== 'string' ||
      !/^[A-P]$/.test(value.code) || typeof value.title !== 'string' ||
      value.title.length === 0 || value.title.length > 160 || value.title.trim() !== value.title) {
    return null;
  }
  return { coordinate: expectedCoordinate, code: value.code, title: value.title };
}

function parseResult(value: unknown): PrivateScoutResultView | null {
  if (!record(value) || !exact(value, [
    'type', 'sessionId', 'requestId', 'requesterUid', 'sourceId', 'cycle',
    'targetCoordinate', 'systemFact',
  ]) || value.type !== 'private-scout-result' || !id(value.sessionId) || !id(value.requestId) ||
      !id(value.requesterUid) || !source(value.sourceId) ||
      !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
      !coordinate(value.targetCoordinate)) return null;
  const systemFact = fact(value.systemFact, value.targetCoordinate);
  if (!systemFact) return null;
  return {
    type: 'private-scout-result', sessionId: value.sessionId, requestId: value.requestId,
    requesterUid: value.requesterUid, sourceId: value.sourceId,
    cycle: value.cycle as number, targetCoordinate: value.targetCoordinate, systemFact,
  };
}

function parseReport(value: unknown): ScoutReportView | null {
  if (!record(value) || !exact(value, [
    'requestId', 'cycle', 'entitlementId', 'targetCoordinate', 'status', 'noteId',
  ]) || !id(value.requestId) || !Number.isSafeInteger(value.cycle) ||
      (value.cycle as number) < 1 || !source(value.entitlementId) ||
      !coordinate(value.targetCoordinate) ||
      (value.status !== 'pending' && value.status !== 'resolved') ||
      (value.status === 'pending' && value.noteId !== null) ||
      (value.status === 'resolved' &&
        (typeof value.noteId !== 'string' || !/^[a-f0-9]{64}$/.test(value.noteId)))) return null;
  return {
    requestId: value.requestId, cycle: value.cycle as number,
    entitlementId: value.entitlementId, targetCoordinate: value.targetCoordinate,
    status: value.status, noteId: value.noteId as string | null,
  };
}

function parsePending(value: unknown): PendingScoutRequestView | null {
  if (!record(value) || !exact(value, [
    'requestId', 'cycle', 'entitlementId', 'anchorShipId', 'targetCoordinate',
  ]) || !id(value.requestId) || !Number.isSafeInteger(value.cycle) ||
      (value.cycle as number) < 1 || !source(value.entitlementId) ||
      !id(value.anchorShipId) || !coordinate(value.targetCoordinate)) return null;
  return {
    requestId: value.requestId, cycle: value.cycle as number,
    entitlementId: value.entitlementId, anchorShipId: value.anchorShipId,
    targetCoordinate: value.targetCoordinate,
  };
}

function parseNote(value: unknown): ScoutDiscoveryNoteView | null {
  if (!record(value) || !exact(value, [
    'type', 'id', 'cycle', 'targetCoordinate', 'systemFact', 'recordedAt',
  ]) || value.type !== 'player-discovery-note' ||
      typeof value.id !== 'string' || !/^[a-f0-9]{64}$/.test(value.id) ||
      !Number.isSafeInteger(value.cycle) || (value.cycle as number) < 1 ||
      !coordinate(value.targetCoordinate) || typeof value.recordedAt !== 'string') return null;
  const systemFact = fact(value.systemFact, value.targetCoordinate);
  if (!systemFact) return null;
  return {
    type: 'player-discovery-note', id: value.id, cycle: value.cycle as number,
    targetCoordinate: value.targetCoordinate, systemFact, recordedAt: value.recordedAt,
  };
}

function authority(gm: boolean): { sessionId: string; uid: string; instanceId?: string } {
  const { session, me, gmInstance } = useSessionStore.getState();
  if (!session || !me?.uid || me.sessionId !== session.id ||
      (gm ? me.role !== 'gm' || gmInstance?.sessionId !== session.id ||
        gmInstance.uid !== me.uid : me.role !== 'player')) {
    throw new Error('Reconnect to your scouting station.');
  }
  requireFreshSessionAuthority();
  return { sessionId: session.id, uid: me.uid,
    ...(gm ? { instanceId: gmInstance!.id } : {}) };
}

async function invoke(name: string, payload: RecordValue, gm: boolean): Promise<unknown> {
  const owner = authority(gm);
  const checkpoint = captureSessionAuthority(owner.sessionId, owner.uid);
  if (!checkpoint) throw new Error('Reconnect to your scouting station.');
  const response = await httpsCallable<typeof payload, unknown>(functions(), name)(payload);
  const current = useSessionStore.getState();
  if (!isCurrentSessionAuthority(checkpoint) ||
      (gm && current.gmInstance?.id !== owner.instanceId) ||
      current.me?.role !== (gm ? 'gm' : 'player')) {
    throw new Error('Scouting authority changed. Reconnect and refresh the station.');
  }
  return response.data;
}

export async function listMyScoutReports(): Promise<readonly ScoutReportView[]> {
  const { sessionId } = authority(false);
  const data = await invoke('listMyScoutReports', { sessionId }, false);
  if (!Array.isArray(data) || data.length > 200) throw new Error('The server returned an invalid report index.');
  const reports = data.map(parseReport);
  if (reports.some((report) => report === null)) throw new Error('The server returned an invalid report index.');
  return reports as ScoutReportView[];
}

export async function readPrivateScoutResult(requestId: string): Promise<PrivateScoutResultView> {
  if (!id(requestId)) throw new Error('Invalid scout request identity.');
  const { sessionId, uid } = authority(false);
  const data = await invoke('readPrivateScoutResult', { sessionId, requestId }, false);
  const result = parseResult(data);
  if (!result || result.sessionId !== sessionId || result.requestId !== requestId ||
      result.requesterUid !== uid) throw new Error('The server returned an invalid private scout result.');
  return result;
}

export async function readMyScoutDiscoveryNote(noteId: string): Promise<ScoutDiscoveryNoteView> {
  if (!/^[a-f0-9]{64}$/.test(noteId)) throw new Error('Invalid discovery note identity.');
  const { sessionId } = authority(false);
  const data = await invoke('readMyScoutDiscoveryNote', { sessionId, noteId }, false);
  const note = parseNote(data);
  if (!note || note.id !== noteId) throw new Error('The server returned an invalid discovery note.');
  return note;
}

export async function listPendingScoutRequests(): Promise<readonly PendingScoutRequestView[]> {
  const { sessionId, instanceId } = authority(true);
  const data = await invoke('listPendingScoutRequests', { sessionId, instanceId }, true);
  if (!Array.isArray(data) || data.length > 200) throw new Error('The server returned an invalid GM scout queue.');
  const requests = data.map(parsePending);
  if (requests.some((entry) => entry === null)) throw new Error('The server returned an invalid GM scout queue.');
  return requests as PendingScoutRequestView[];
}

export async function resolvePendingScoutRequest(requestId: string): Promise<PrivateScoutResultView> {
  if (!id(requestId)) throw new Error('Invalid scout request identity.');
  const { sessionId, instanceId } = authority(true);
  const data = await invoke('resolvePendingScoutRequest', { sessionId, requestId, instanceId }, true);
  if (!record(data) || !exact(data, ['status', 'result']) ||
      (data.status !== 'resolved' && data.status !== 'replayed')) {
    throw new Error('The server returned an invalid scout reveal.');
  }
  const result = parseResult(data.result);
  if (!result || result.sessionId !== sessionId || result.requestId !== requestId) {
    throw new Error('The server returned an invalid scout reveal.');
  }
  return result;
}
