import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeWolfAttackMemberView } from '@/lib/firestore';
import { useSessionStore } from '@/store/useSessionStore';
import type { GameSession, Player, WolfAttackMemberView } from '@/types/game';

export type WolfAttackChoiceActor = 'gorgoneion-captain' | 'wolf-commander' | 'executive-officer' | 'ship-crew';

export interface WolfAttackChoiceAuthority {
  readonly sessionId?: string;
  readonly key: string;
  readonly actorReady: boolean;
  readonly ready: boolean;
  readonly enabled: boolean;
}

function browserIsOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function authorityFor(
  actor: WolfAttackChoiceActor,
  suppliedSessionId: string | undefined,
  enabled: boolean,
  values: Readonly<{
    session: GameSession | null;
    me: Player | null;
    connection: string;
    freshness: string;
    identityRevision: number;
    online: boolean;
  }>,
): WolfAttackChoiceAuthority {
  const { session, me, connection, freshness, identityRevision, online } = values;
  const sessionId = suppliedSessionId ?? session?.id;
  const baseActor = Boolean(sessionId && session?.id === sessionId && me?.sessionId === sessionId &&
    me.role === 'player' && me.connected !== false && me.fleetGroupId && me.replacementStatus == null);
  const actorReady = baseActor && (actor === 'gorgoneion-captain'
    ? me?.replacementRoleId === 'gorgoneion-captain'
    : actor === 'wolf-commander'
      ? me?.replacementRoleId === 'wolf-commander'
      : actor === 'executive-officer'
        ? me?.activeConsoleRoleId === 'executive-officer'
        : true);
  const gorgoneion = session?.smallShipStates?.gorgoneion;
  const discovery = session?.playerDiscovery;
  const key = JSON.stringify([
    actor, sessionId ?? null, session?.id ?? null, session?.phase ?? null, session?.currentTurn ?? null,
    me?.sessionId ?? null, me?.uid ?? null, me?.connectionGeneration ?? null, me?.role ?? null, me?.connected ?? null,
    me?.replacementRoleId ?? null, me?.replacementStatus ?? null, me?.assignedRoleId ?? null,
    me?.activeConsoleRoleId ?? null, me?.seatId ?? null, me?.fleetGroupId ?? null, identityRevision,
    discovery?.groupId ?? null, discovery?.shipId ?? null, discovery?.revision ?? null,
    discovery?.fleetGroupVesselIds ?? [], gorgoneion?.hostShipId ?? null, gorgoneion?.dockingRevision ?? null,
    connection, freshness, online, enabled,
  ]);
  return {
    ...(sessionId ? { sessionId } : {}), key, actorReady, enabled,
    ready: Boolean(actorReady && enabled && session?.phase === 'active' && connection === 'live' &&
      freshness === 'server' && online),
  };
}

export function useWolfAttackChoiceAuthority(
  actor: WolfAttackChoiceActor,
  suppliedSessionId?: string,
  enabled = true,
): WolfAttackChoiceAuthority {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const freshness = useSessionStore((state) => state.sessionSnapshotFreshness);
  const identityRevision = useSessionStore((state) => state.identityHydrationRevision);
  const [online, setOnline] = useState(browserIsOnline);

  useEffect(() => {
    const update = () => setOnline(browserIsOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return authorityFor(actor, suppliedSessionId, enabled, {
    session, me, connection, freshness, identityRevision, online,
  });
}

export function wolfAttackChoiceAuthorityIsCurrent(
  actor: WolfAttackChoiceActor,
  authorityKey: string,
  sessionId: string | undefined,
  enabled = true,
): boolean {
  const current = useSessionStore.getState();
  const authority = authorityFor(actor, sessionId, enabled, {
    session: current.session,
    me: current.me,
    connection: current.connection,
    freshness: current.sessionSnapshotFreshness,
    identityRevision: current.identityHydrationRevision,
    online: browserIsOnline(),
  });
  return authority.ready && authority.key === authorityKey;
}

function memberCheckpoint(member: WolfAttackMemberView): string {
  return JSON.stringify([
    member.sessionId, member.attackId, member.turn, member.revision, member.status,
    member.currentStep, member.range,
  ]);
}

export interface WolfAttackChoiceController<T> {
  readonly authority: WolfAttackChoiceAuthority;
  readonly memberView: WolfAttackMemberView | null;
  readonly view: T | null;
  readonly busy: boolean;
  readonly error?: string;
  readonly message?: string;
  readonly refresh: () => void;
  readonly runMutation: (action: () => Promise<unknown>, successMessage: string) => void;
}

interface UseWolfAttackChoiceControllerOptions<T> {
  readonly authority: WolfAttackChoiceAuthority;
  readonly actor: WolfAttackChoiceActor;
  readonly expectedStep: (member: WolfAttackMemberView) => boolean;
  readonly read: () => Promise<T>;
  readonly readMatches: (value: T, member: WolfAttackMemberView) => boolean;
  readonly subscribe?: typeof subscribeWolfAttackMemberView;
  readonly readFailureMessage: string;
  readonly mutationFailureMessage: string;
  readonly refreshAfterMutation?: boolean;
}

type BoundMember = Readonly<{ authorityKey: string; member: WolfAttackMemberView }>;
type BoundRead<T> = Readonly<{ authorityKey: string; memberCheckpoint: string; value: T }>;
type BoundNotice = Readonly<{ authorityKey: string; message: string }>;
type BusyState = Readonly<{ authorityKey: string; token: symbol }>;

export function useWolfAttackChoiceController<T>({
  authority,
  actor,
  expectedStep,
  read,
  readMatches,
  subscribe = subscribeWolfAttackMemberView,
  readFailureMessage,
  mutationFailureMessage,
  refreshAfterMutation = true,
}: UseWolfAttackChoiceControllerOptions<T>): WolfAttackChoiceController<T> {
  const [memberState, setMemberState] = useState<BoundMember | null>(null);
  const [readState, setReadState] = useState<BoundRead<T> | null>(null);
  const [errorState, setErrorState] = useState<BoundNotice | null>(null);
  const [messageState, setMessageState] = useState<BoundNotice | null>(null);
  const [busyState, setBusyState] = useState<BusyState | null>(null);
  const memberRef = useRef<BoundMember | null>(null);
  const readRef = useRef<BoundRead<T> | null>(null);
  const mutationInFlightRef = useRef(false);
  const blockedCheckpointRef = useRef<string | null>(null);
  const refreshRef = useRef<(() => void) | null>(null);
  const activeAuthorityRef = useRef(authority.key);
  activeAuthorityRef.current = authority.key;
  memberRef.current = memberState;
  readRef.current = readState;

  useEffect(() => {
    setMemberState(null);
    memberRef.current = null;
    setReadState(null);
    readRef.current = null;
    setErrorState(null);
    setMessageState(null);
    setBusyState(null);
    refreshRef.current = null;
    if (!authority.ready || !authority.sessionId) return;

    let live = true;
    let latestRequest = 0;
    let reading = false;
    let queuedMember: WolfAttackMemberView | null = null;
    const key = authority.key;
    const sessionId = authority.sessionId;
    const canContinue = () => live && activeAuthorityRef.current === key &&
      wolfAttackChoiceAuthorityIsCurrent(actor, key, sessionId, authority.enabled);

    const readLoop = async (): Promise<void> => {
      if (reading || (!refreshAfterMutation && mutationInFlightRef.current)) return;
      reading = true;
      while (live && queuedMember) {
        const requestedMember = queuedMember;
        queuedMember = null;
        const requestNumber = latestRequest;
        try {
          const value = await read();
          if (!canContinue() || requestNumber !== latestRequest || (!refreshAfterMutation && mutationInFlightRef.current) ||
              blockedCheckpointRef.current === `${key}:${memberCheckpoint(requestedMember)}`) continue;
          const currentMember = memberRef.current;
          if (!currentMember || currentMember.authorityKey !== key ||
              memberCheckpoint(currentMember.member) !== memberCheckpoint(requestedMember)) continue;
          if (readMatches(value, requestedMember)) {
            const next = { authorityKey: key, memberCheckpoint: memberCheckpoint(requestedMember), value };
            readRef.current = next;
            setReadState(next);
            setErrorState(null);
          } else {
            readRef.current = null;
            setReadState(null);
            setErrorState({ authorityKey: key, message: 'The server attack step changed. Waiting for its current status.' });
          }
        } catch (cause) {
          if (!canContinue() || requestNumber !== latestRequest || (!refreshAfterMutation && mutationInFlightRef.current) ||
              blockedCheckpointRef.current === `${key}:${memberCheckpoint(requestedMember)}`) continue;
          const currentMember = memberRef.current;
          if (!currentMember || currentMember.authorityKey !== key ||
              memberCheckpoint(currentMember.member) !== memberCheckpoint(requestedMember)) continue;
          readRef.current = null;
          setReadState(null);
          setErrorState({
            authorityKey: key,
            message: cause instanceof Error ? cause.message : readFailureMessage,
          });
        }
      }
      reading = false;
      if (live && queuedMember) void readLoop();
    };

    const requestRead = (member: WolfAttackMemberView) => {
      if (blockedCheckpointRef.current === `${key}:${memberCheckpoint(member)}`) return;
      latestRequest += 1;
      queuedMember = member;
      if (!reading) void readLoop();
    };

    const onView = (next: WolfAttackMemberView | null) => {
      if (!canContinue()) return;
      if (!next || next.sessionId !== sessionId || !expectedStep(next)) {
        latestRequest += 1;
        queuedMember = null;
        memberRef.current = null;
        readRef.current = null;
        setMemberState(null);
        setReadState(null);
        setErrorState(null);
        setMessageState(null);
        return;
      }
      const checkpoint = memberCheckpoint(next);
      const previous = memberRef.current;
      const unchanged = previous?.authorityKey === key && memberCheckpoint(previous.member) === checkpoint;
      const bound = { authorityKey: key, member: next };
      memberRef.current = bound;
      setMemberState(bound);
      if (!unchanged) {
        readRef.current = null;
        setReadState(null);
        setErrorState(null);
        setMessageState(null);
      }
      requestRead(next);
    };

    const unsubscribe = subscribe(sessionId, onView);
    refreshRef.current = () => {
      if (!canContinue()) return;
      blockedCheckpointRef.current = null;
      const currentMember = memberRef.current;
      if (currentMember?.authorityKey === key && expectedStep(currentMember.member)) {
        requestRead(currentMember.member);
      }
    };
    return () => {
      live = false;
      latestRequest += 1;
      queuedMember = null;
      if (refreshRef.current) refreshRef.current = null;
      unsubscribe();
    };
  }, [actor, authority.enabled, authority.key, authority.ready, authority.sessionId, expectedStep, read, readFailureMessage, readMatches, refreshAfterMutation, subscribe]);

  const memberView = authority.ready && memberState?.authorityKey === authority.key
    ? memberState.member : null;
  const currentMemberCheckpoint = memberView ? memberCheckpoint(memberView) : null;
  const view = authority.ready && currentMemberCheckpoint && readState?.authorityKey === authority.key &&
      readState.memberCheckpoint === currentMemberCheckpoint
    ? readState.value : null;
  const busy = authority.ready && busyState?.authorityKey === authority.key;
  const error = authority.ready && errorState?.authorityKey === authority.key ? errorState.message : undefined;
  const message = authority.ready && messageState?.authorityKey === authority.key ? messageState.message : undefined;

  const refresh = useCallback(() => {
    if (!authority.ready || !wolfAttackChoiceAuthorityIsCurrent(actor, authority.key, authority.sessionId, authority.enabled)) return;
    refreshRef.current?.();
  }, [actor, authority.enabled, authority.key, authority.ready, authority.sessionId]);

  const runMutation = useCallback((action: () => Promise<unknown>, successMessage: string) => {
    const boundRead = readRef.current;
    const boundMember = memberRef.current;
    if (mutationInFlightRef.current || !authority.ready || !boundRead || !boundMember || boundRead.authorityKey !== authority.key ||
        boundMember.authorityKey !== authority.key ||
        boundRead.memberCheckpoint !== memberCheckpoint(boundMember.member) ||
        !wolfAttackChoiceAuthorityIsCurrent(actor, authority.key, authority.sessionId, authority.enabled)) return;
    const memberAtStart = boundMember.member;
    const checkpoint = memberCheckpoint(memberAtStart);
    const token = Symbol('wolf-attack-choice');
    mutationInFlightRef.current = true;
    if (!refreshAfterMutation) blockedCheckpointRef.current = `${authority.key}:${checkpoint}`;
    setBusyState({ authorityKey: authority.key, token });
    setErrorState(null);
    setMessageState(null);
    void (async () => {
      try {
        await action();
        if (!wolfAttackChoiceAuthorityIsCurrent(actor, authority.key, authority.sessionId, authority.enabled) ||
            activeAuthorityRef.current !== authority.key) return;
        const latestMember = memberRef.current;
        if (!latestMember || latestMember.authorityKey !== authority.key ||
            memberCheckpoint(latestMember.member) !== checkpoint) return;
        readRef.current = null;
        setReadState(null);
        setMessageState({ authorityKey: authority.key, message: successMessage });
        if (refreshAfterMutation) {
          mutationInFlightRef.current = false;
          refreshRef.current?.();
        }
      } catch (cause) {
        if (!wolfAttackChoiceAuthorityIsCurrent(actor, authority.key, authority.sessionId, authority.enabled) ||
            activeAuthorityRef.current !== authority.key) return;
        const latestMember = memberRef.current;
        if (!latestMember || latestMember.authorityKey !== authority.key ||
            memberCheckpoint(latestMember.member) !== checkpoint) return;
        readRef.current = null;
        setReadState(null);
        setErrorState({
          authorityKey: authority.key,
          message: cause instanceof Error ? cause.message : mutationFailureMessage,
        });
        if (refreshAfterMutation) {
          mutationInFlightRef.current = false;
          refreshRef.current?.();
        }
      } finally {
        mutationInFlightRef.current = false;
        if (activeAuthorityRef.current === authority.key) {
          setBusyState((current) => current?.token === token ? null : current);
        }
      }
    })();
  }, [actor, authority.enabled, authority.key, authority.ready, authority.sessionId, mutationFailureMessage, refreshAfterMutation]);

  return { authority, memberView, view, busy, ...(error ? { error } : {}), ...(message ? { message } : {}), refresh, runMutation };
}
