import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, Transaction, DocumentSnapshot } from 'firebase-admin/firestore';
import { isGmAccessActive } from './gmAccess';
import { PRESENCE_LEASE_MS } from './sessionLifecycle';

type Actor = { uid: string; workspace: string; instanceId: string };
type State = { forms: [string, { workspace: string; published?: { handle: string } }][]; shares: [string, { workspace: string }][]; responses: unknown[] };
type Model = { exportSyntheticState(): State; assign(...args: unknown[]): unknown; dossier(...args: unknown[]): unknown } & Record<string, (...args: unknown[]) => unknown>;
type Gateway = { handle(request: unknown): Promise<unknown> };
type Core = { CastingService: new (input: unknown) => Model; createSessionCastingGateway(dependencies: unknown): Gateway };
// Build bundles the canonical tested model; no duplicate server business logic or preview fixtures.
// The generated CJS artifact is loaded lazily after Functions build creates it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const castingCore = (): Core => require('../lib/casting-companion-core.cjs') as Core;
type Request = { data: unknown; auth?: { uid: string }; app?: unknown };
type Dependencies = { db: Firestore; requireGm(tx: Transaction, sessionId: string, uid: string, instanceId: string): Promise<{ session: DocumentSnapshot; player: DocumentSnapshot; instance: DocumentSnapshot }>; verifyIdentity(request: Request): Promise<string>; now?: () => number; emulator?: boolean };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function fail(code: ConstructorParameters<typeof HttpsError>[0]): never { throw new HttpsError(code, code); }
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : fail('invalid-argument');
const identifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : fail('invalid-argument');
const workspaceIdentifier = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value) ? value : fail('invalid-argument');
function millis(value: unknown): number { if (typeof value === 'number') return value; if (value instanceof Date) return value.getTime(); if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') return Number(value.toMillis()); return NaN; }
const available = (session: DocumentSnapshot) => session.exists && !['closed','retained-empty'].includes(String(session.get('phase'))) && !session.get('deletingAt');
const handles = (state: State) => new Map([...state.forms.filter(([, f]) => f.published).map(([, f]) => [f.published!.handle, 'form'] as const), ...state.shares.map(([handle]) => [handle, 'dossier'] as const)]);

export function createCastingCommands({ db, requireGm, verifyIdentity, now = Date.now, emulator = false }: Dependencies) {
  async function currentGm(tx: Transaction, sessionId: string, actor: Actor) {
    const access = await tx.get(db.doc(`gmAccess/${actor.uid}`));
    const time = now(); if (!Number.isFinite(time) || !access.exists || !isGmAccessActive(access.get('authenticatedAt'), time)) fail('permission-denied');
    const authority = await requireGm(tx, sessionId, actor.uid, actor.instanceId);
    const live = (value: unknown) => { const seen = millis(value); return Number.isFinite(seen) && seen <= time && time - seen < PRESENCE_LEASE_MS; };
    if (!available(authority.session) || authority.player.get('connected') !== true || authority.player.get('kickedAt') != null || !live(authority.player.get('lastSeenAt')) || authority.instance.get('uid') !== actor.uid || authority.instance.get('connected') !== true || !live(authority.instance.get('lastSeenAt') ?? authority.instance.get('claimedAt'))) fail('permission-denied');
    return authority;
  }
  const store = {
    async invoke(actor: Actor | null, method: string, args: unknown[], submitUid?: string) {
      return db.runTransaction(async tx => {
        const core = castingCore();
        let workspace: string; let root: DocumentSnapshot;
        if (method === 'bindWorkspace') {
          if (!actor) fail('unauthenticated'); const session = identifier(args[0]); await currentGm(tx, session, actor);
          const sessionIndex = db.doc(`castingSessionWorkspaces/${session}`), index = await tx.get(sessionIndex);
          workspace = index.exists ? workspaceIdentifier(index.get('workspace')) : workspaceIdentifier(actor.workspace);
          const ref = db.doc(`castingWorkspaces/${workspace}`); root = await tx.get(ref);
          if (root.exists && root.get('sessionId') !== session) fail('permission-denied');
          if (!root.exists) { const empty = new core.CastingService({ memberships: [] }).exportSyntheticState(); tx.create(ref, { sessionId: session, stateJson: JSON.stringify(empty) }); }
          if (!index.exists) tx.create(sessionIndex, { workspace });
          return { workspace, sessionId: session };
        }
        let handleIndex: DocumentSnapshot | undefined;
        if (['publicForm','submit','dossier'].includes(method)) {
          const handle = identifier(args[0]); if (!/^[A-Za-z0-9_-]{32}$/.test(handle)) fail('not-found');
          handleIndex = await tx.get(db.doc(`castingPublishedHandles/${hash(handle)}`));
          if (!handleIndex.exists || handleIndex.get('active') !== true || handleIndex.get('kind') !== (method === 'dossier' ? 'dossier' : 'form')) fail('not-found');
          workspace = workspaceIdentifier(handleIndex.get('workspace'));
        } else { if (!actor) fail('unauthenticated'); workspace = workspaceIdentifier(actor.workspace); }
        const ref = db.doc(`castingWorkspaces/${workspace}`); root = await tx.get(ref);
        if (!root.exists) fail(handleIndex ? 'not-found' : 'permission-denied');
        const sessionId = identifier(root.get('sessionId'));
        if (handleIndex) { const session = await tx.get(db.doc(`sessions/${sessionId}`)); if (!available(session)) fail('not-found'); }
        else { if (!actor) fail('unauthenticated'); await currentGm(tx, sessionId, actor); }
        const raw = root.get('stateJson'); if (typeof raw !== 'string' || Buffer.byteLength(raw) > 700 * 1024) fail('internal');
        const before = JSON.parse(raw) as State;
        const model = new core.CastingService({ memberships: actor ? [{ uid: actor.uid, workspace, role: 'owner' }] : [], state: before });
        let result: unknown;
        if (method === 'assign') result = model.assign(actor, args[0], args[1], 'internal-bearer-snapshot', args[2], args[3], args[4]);
        else if (method === 'dossier') result = model.dossier({ uid: 'internal-bearer-snapshot', workspace }, args[0]);
        else { const operation = model[method]; if (typeof operation !== 'function') fail('invalid-argument'); result = ['publicForm','submit'].includes(method) ? operation.call(model, ...args) : operation.call(model, actor, ...args); }
        const after = model.exportSyntheticState(), stateJson = JSON.stringify(after); if (Buffer.byteLength(stateJson) > 700 * 1024) fail('resource-exhausted');
        const oldHandles = handles(before), newHandles = handles(after), changed = [...new Set([...oldHandles.keys(), ...newHandles.keys()])].filter(handle => oldHandles.has(handle) !== newHandles.has(handle));
        const updates = await Promise.all(changed.map(async handle => ({ handle, ref: db.doc(`castingPublishedHandles/${hash(handle)}`), previous: await tx.get(db.doc(`castingPublishedHandles/${hash(handle)}`)) })));
        for (const update of updates) if (newHandles.has(update.handle) && update.previous.exists) fail('already-exists');
        const added = after.responses.length - before.responses.length;
        let budgets: { ref: ReturnType<Firestore['doc']>; count: number; maximum: number }[] = [];
        if (method === 'submit' && added > 0) {
          if (!submitUid) fail('unauthenticated'); const hour = Math.floor(now() / 3600000);
          budgets = await Promise.all([{ key: `uid-${hash(submitUid)}-${hour}`, maximum: 20 }, { key: `publication-${hash(String(args[0]))}`, maximum: 200 }].map(async budget => {
            const counterRef = db.doc(`castingIngressCounters/${budget.key}`), counter = await tx.get(counterRef), count = counter.exists ? counter.get('count') as unknown : 0;
            if (!Number.isSafeInteger(count) || (count as number) < 0) fail('internal'); if ((count as number) + added > budget.maximum) fail('resource-exhausted'); return { ref: counterRef, count: (count as number) + added, maximum: budget.maximum };
          }));
        }
        if (stateJson !== raw) tx.set(ref, { sessionId, stateJson });
        for (const update of updates) { const data = { workspace, kind: newHandles.get(update.handle) ?? oldHandles.get(update.handle), active: newHandles.has(update.handle) }; if (update.previous.exists) tx.set(update.ref, data); else tx.create(update.ref, data); }
        for (const budget of budgets) tx.set(budget.ref, { count: budget.count });
        return result;
      });
    },
  };
  return { async handle(request: Request): Promise<unknown> {
    try {
      const data = record(request.data); if (Buffer.byteLength(JSON.stringify(data)) > 256 * 1024 || Object.keys(data).some(key => !['operation','payload','instanceId'].includes(key))) fail('invalid-argument');
      if (!emulator && !request.app) fail('failed-precondition');
      const operation = data.operation, payload = record(data.payload);
      if (operation === 'prerequisite') {
        if (Object.keys(payload).length) fail('invalid-argument'); const uid = identifier(await verifyIdentity(request));
        return db.runTransaction(async tx => {
          const membership = await tx.get(db.doc(`activeMemberships/${uid}`)); const access = await tx.get(db.doc(`gmAccess/${uid}`));
          const gmAccessActive = access.exists && isGmAccessActive(access.get('authenticatedAt'), now());
          if (!membership.exists) return { sessions: [], gmAccessActive };
          const sessionId = identifier(membership.get('sessionId')), session = await tx.get(db.doc(`sessions/${sessionId}`)), player = await tx.get(db.doc(`sessions/${sessionId}/players/${uid}`));
          if (!available(session) || !player.exists || player.get('connected') !== true || player.get('kickedAt') != null) return { sessions: [], gmAccessActive };
          const instances = gmAccessActive ? await tx.get(db.collection(`sessions/${sessionId}/gmInstances`).where('uid','==',uid).limit(20)) : undefined;
          const validInstances: { id: string; name: string }[] = [];
          for (const instance of instances?.docs ?? []) { try { await currentGm(tx, sessionId, { uid, workspace: '', instanceId: instance.id }); validInstances.push({ id: instance.id, name: String(instance.get('name') ?? 'GM') }); } catch (failure) { if (!(failure instanceof HttpsError) || failure.code !== 'permission-denied') throw failure; } }
          return { gmAccessActive, sessions: [{ id: sessionId, name: String(session.get('name') ?? 'Session'), phase: session.get('phase'), currentTurn: session.get('currentTurn'), gmActive: validInstances.length > 0, instances: validInstances }] };
        });
      }
      const publicRead = operation === 'publicForm' || operation === 'dossier';
      const uid = publicRead ? undefined : identifier(await verifyIdentity(request));
      if (Object.hasOwn(payload,'workspace')) workspaceIdentifier(payload.workspace);
      for (const key of ['sessionId','formId','responseId','templateId','instanceId','expectedInstanceId']) if (Object.hasOwn(payload,key)) identifier(payload[key]);
      const instanceId = data.instanceId === undefined ? '' : identifier(data.instanceId);
      const gateway = castingCore().createSessionCastingGateway({ store: { invoke: (actor: Actor | null, method: string, args: unknown[]) => store.invoke(actor,method,args,uid) }, verifyContext: async () => ({ appVerified: true, identity: uid ? { uid, verified: true } : null, instanceId }), verifySubmissionAttempt: async ({ attempt, handle }: { attempt: string; handle: string }) => ({ nonce: attempt, scope: JSON.stringify([uid, handle]) }) });
      return await gateway.handle({ operation, payload });
    } catch (failure) { if (failure instanceof HttpsError) throw failure; const code = failure && typeof failure === 'object' && 'code' in failure ? failure.code : 'internal'; const allowed = new Set(['invalid-argument','unauthenticated','permission-denied','failed-precondition','not-found','aborted','resource-exhausted','already-exists','internal','unavailable','deadline-exceeded']); throw new HttpsError(allowed.has(String(code)) ? code as ConstructorParameters<typeof HttpsError>[0] : 'internal', String(allowed.has(String(code)) ? code : 'internal')); }
  } };
}
