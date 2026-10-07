import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { rememberProofFailure } from './pc10-proof-failure-evidence.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { candidateEvidenceEnvelope, waitForMaintenanceReceipt } from './pc10-candidate-proof-helpers.mjs';
import { normalMemberRoleRequiresBerth } from './pc10-normal-member-projection-contract.mjs';
import { createMemberNavigationResumeObserver } from './pc10-member-navigation-resume.mjs';

function hasExactKeys(value, expected) {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key));
}

/** Native-test seam for the safe browser-to-Node Firestore read envelope. */
export function unwrapBrowserFirestoreReadOutcome(outcome) {
  if (hasExactKeys(outcome, ['status', 'value']) && outcome.status === 'ok') return outcome.value;
  if (hasExactKeys(outcome, ['status', 'code']) && outcome.status === 'error' &&
      (outcome.code === null || (typeof outcome.code === 'string' && outcome.code.length <= 128))) {
    const error = new Error('Authenticated browser Firestore read failed.');
    if (typeof outcome.code === 'string') Object.defineProperty(error, 'code', { value: outcome.code });
    throw error;
  }
  throw new Error('Authenticated browser Firestore read returned an invalid result.');
}

/** Compose genuine UI-selected crew accounts; no token, Admin write or store setter. */
export function createTwoBrowserGameplay(context, { preAdmissionGmOnly = false } = {}) {
  const { gm, crew, initial, roster, directory } = context;
  if (preAdmissionGmOnly) {
    assert.ok(initial.sessionId && initial.joinCode && initial.uidHash &&
      Number.isFinite(initial.documentTimeOrigin) && initial.documentTimeOrigin > 0 &&
      roster === undefined && context.confirmed === undefined && context.prepared === undefined && context.started === undefined,
    'Use the original pre-admission GM setup context; never supply an invented roster.');
  } else assert.ok(initial.sessionId && initial.joinCode && roster.length);
  const actions = [], snapshots = [];
  const consumed = {};
  const hash = value => createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
  let setupGmInstanceId;
  async function live(surface, deadlineAt = Date.now() + 60_000) {
    if (preAdmissionGmOnly) {
      assert.ok(Number.isFinite(deadlineAt) && Date.now() < deadlineAt, 'Original GM setup selection deadline expired.');
      const current = await surface.until('The original pre-admission GM is live', state =>
        state.sameActor && state.sessionId === initial.sessionId && state.connection === 'live' &&
        state.freshness === 'server' && state.gmInstanceOwned,
      Math.max(1, Math.min(60_000, deadlineAt - Date.now())));
      assert.equal(current.hasAuth, true); assert.equal(current.playerRole, 'gm');
      assert.equal(current.uidHash, initial.uidHash); assert.equal(current.documentTimeOrigin, initial.documentTimeOrigin);
      assert.equal(current.phase, 'lobby'); assert.equal(current.cycle, 0);
      assert.ok(typeof current.instanceId === 'string' && current.instanceId.length > 0);
      // initial was captured before the named GM joined; bind that real owned
      // instance on first selection, and retain it for every later selection.
      setupGmInstanceId ??= current.instanceId;
      assert.equal(current.instanceId, setupGmInstanceId);
      assert.ok(Date.now() < deadlineAt, 'Original GM setup selection deadline expired.');
      return current;
    }
    return surface.until('The current normally admitted actor is live', state =>
      state.sameActor && state.sessionId === initial.sessionId && state.connection === 'live' &&
      state.freshness === 'server' && (surface !== gm || state.gmInstanceOwned), Math.max(1, Math.min(60_000, deadlineAt - Date.now())));
  }
  async function acceptedMember(actor, deadlineAt, { original, held = false, station = false, requireCurrentBerth = false, requireCurrentPressMember = false, navigation } = {}) {
    let waitingOriginal, current;
    const budget = () => assert.ok(Number.isFinite(deadlineAt) && Date.now() < deadlineAt,
      'Original role navigation deadline expired.');
    const observeCurrent = (includeAcceptance = false) => {
      const moduleUrl = crew.storeModuleUrl();
      let authorityModuleUrl;
      if (includeAcceptance) {
        authorityModuleUrl = crew.sessionAuthorityModuleUrl?.();
        assert.ok(typeof authorityModuleUrl === 'string' && authorityModuleUrl.length > 0,
          'The mounted App SDK authority module must be observed before station resume acceptance.');
        const storeUrl = new URL(moduleUrl, 'http://127.0.0.1');
        const authorityUrl = new URL(authorityModuleUrl, storeUrl);
        assert.equal(authorityUrl.origin, storeUrl.origin, 'Authority must come from the mounted App origin.');
        assert.equal(authorityUrl.pathname, '/src/lib/sessionSnapshotAuthority.ts');
      }
      return crew.page.evaluate(async input => {
      const moduleUrl = typeof input === 'string' ? input : input.moduleUrl;
      const acceptanceAuthority = typeof input === 'object' ? await import(input.authorityModuleUrl) : null;
      const { useSessionStore } = await import(moduleUrl);
      const { auth } = await import('/src/lib/firebase.ts');
      const { activeDemoActorProfile } = await import('/src/lib/demoActorContext.ts');
      const originalUser = auth().currentUser, originalUid = originalUser?.uid;
      const uidHash = originalUser ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(originalUid)))).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 16) : null;
      // The digest yields. Sample current member readiness afterward, and
      // never pair a changed Auth identity with the original private hash.
      const snapshot = useSessionStore.getState(), me = snapshot.me, user = auth().currentUser;
      if (user?.uid !== originalUid) throw new Error('Original Auth UID changed during role navigation observation.');
      const session = snapshot.session, berth = session?.currentActorBerthAuthority;
      const currentMemberBerthPresent = !!session && Object.hasOwn(session, 'currentActorBerthAuthority');
      // Join the current member transaction witness using App's exact source
      // contract. Return flags only; the raw witness/UID stays in this page.
      const keys = ['sessionId', 'actorUid', 'groupId', 'role', 'connectionGeneration',
        'assignedRoleId', 'activeConsoleRoleId', 'replacementRoleId', 'replacementStatus', 'shipId'];
      const wireId = value => typeof value === 'string' && value.length > 0 && value.length <= 1_500 && !value.includes('/');
      const nullableRole = id => id === null || wireId(id);
      const currentMemberBerthMatches = Boolean(session && berth && typeof berth === 'object' && !Array.isArray(berth) &&
        Object.keys(berth).length === keys.length && Object.keys(berth).every(key => keys.includes(key)) &&
        wireId(berth.sessionId) && wireId(berth.actorUid) && wireId(berth.shipId) &&
        typeof berth.groupId === 'string' && /^fleet-[1-9][0-9]*$/.test(berth.groupId) && berth.role === 'player' &&
        Number.isSafeInteger(berth.connectionGeneration) && berth.connectionGeneration >= 1 &&
        nullableRole(berth.assignedRoleId) && nullableRole(berth.activeConsoleRoleId) && nullableRole(berth.replacementRoleId) &&
        berth.replacementStatus === null && session.phase !== 'closed' &&
        me?.role === 'player' && me.connected === true && me.replacementStatus == null &&
        berth.sessionId === session.id && me.sessionId === session.id && berth.actorUid === me.uid &&
        berth.groupId === me.fleetGroupId && berth.groupId === session.memberSessionScope?.groupId &&
        Array.isArray(session.memberSessionScope?.vesselIds) && session.memberSessionScope.vesselIds.includes(berth.shipId) &&
        berth.connectionGeneration === (me.connectionGeneration ?? 1) &&
        berth.assignedRoleId === (me.assignedRoleId ?? null) && berth.activeConsoleRoleId === (me.activeConsoleRoleId ?? null) &&
        berth.replacementRoleId === (me.replacementRoleId ?? null));
      // The ordinary join/resume reply omits the member envelope and own
      // connected flag. Modern Press confirms membership without a ship berth.
      const currentPressMemberMatches = Boolean(session && currentMemberBerthPresent && berth === null &&
        session.phase !== 'closed' && me?.role === 'player' && me.sessionId === session.id &&
        me.fleetGroupId === session.memberSessionScope?.groupId &&
        Array.isArray(session.memberSessionScope?.vesselIds) && session.memberSessionScope.vesselIds.length === 0);
      return { documentTimeOrigin: performance.timeOrigin,
        hasAuth: !!user, sameActor: !!user && user.uid === me?.uid, uidHash,
        profileRoleId: activeDemoActorProfile?.roleId ?? null,
        profileSessionId: activeDemoActorProfile?.sessionId ?? null,
        sessionId: snapshot.session?.id ?? null, meSessionId: me?.sessionId ?? null,
        playerRole: me?.role ?? null, assignedRoleId: me?.assignedRoleId ?? null,
        activeConsoleRoleId: me?.activeConsoleRoleId ?? null, fleetGroupId: me?.fleetGroupId ?? null,
        seatId: me?.seatId ?? null, replacementRoleId: me?.replacementRoleId ?? null,
        replacementStatus: me?.replacementStatus ?? null, escapeLocked: me?.escapeState != null,
        connectionGeneration: me?.connectionGeneration ?? null,
        identityHydrationRevision: snapshot.identityHydrationRevision ?? null,
        connected: me?.connected !== false,
        currentMemberBerthPresent, currentMemberBerthMatches,
        currentOwnPlayerConfirmed: me?.connected === true, currentPressMemberMatches,
        connection: snapshot.connection, freshness: snapshot.sessionSnapshotFreshness,
        ...(acceptanceAuthority ? {
          currentCanonicalSeatOwned: snapshot.seats.some(seat => seat.id === me?.assignedRoleId &&
            (seat.roleId ?? seat.id) === me.assignedRoleId && seat.status === 'claimed' && seat.holderUid === me.uid),
          clientAcceptance: (() => {
            const authority = originalUid && session?.id ? acceptanceAuthority.sessionSnapshotAuthorityFor(session.id, originalUid) : null;
            return { hasServerAuthority: authority?.hasServerSessionAuthority === true,
              resumePending: authority ? acceptanceAuthority.memberSessionResumeBlocksFreshness(authority) : true };
          })(),
        } : {}) };
      }, includeAcceptance ? { moduleUrl, authorityModuleUrl } : moduleUrl);
    };
    try {
      budget();
      while (Date.now() < deadlineAt) {
        budget();
        // Session listeners can become live before this document's initial resume
        // accepts identity. This counter is runtime-only and setIdentity-owned.
        current = await observeCurrent();
        budget();
        navigation?.sample(current);
        assert.ok(Number.isSafeInteger(current.identityHydrationRevision) && current.identityHydrationRevision >= 0,
          'Current document identityHydrationRevision evidence is required.');
        if (waitingOriginal) {
          for (const key of ['documentTimeOrigin', 'uidHash', 'profileRoleId', 'profileSessionId', 'sessionId',
            'meSessionId', 'playerRole', 'assignedRoleId', 'fleetGroupId', 'connectionGeneration', 'identityHydrationRevision'])
            assert.equal(current[key], waitingOriginal[key], `Original pre-selection ${key} changed.`);
        }
        if (original) {
          // Normal entry may acquire the assigned open seat at the same lease.
          // Fresh member witness and the existing held canonical-seat check
          // own that capability; seatId is not immutable document identity.
          for (const key of ['documentTimeOrigin', 'uidHash', 'profileRoleId', 'profileSessionId', 'sessionId',
            'meSessionId', 'playerRole', 'assignedRoleId', 'fleetGroupId', 'replacementRoleId', 'replacementStatus', 'escapeLocked'])
            assert.equal(current[key], original[key], `Original role navigation ${key} changed.`);
          if (current.connectionGeneration !== original.connectionGeneration ||
              current.identityHydrationRevision !== original.identityHydrationRevision) {
            assert.ok(navigation && station && normalMemberRoleRequiresBerth(actor.roleId) && original.currentMemberBerthPresent,
              'Original role navigation epoch changed without a witnessed normal station resume.');
            const acceptedCurrent = await navigation.accept(original, current, () => observeCurrent(true));
            if (!acceptedCurrent) {
              budget(); await delay(Math.min(250, deadlineAt - Date.now())); continue;
            }
            current = acceptedCurrent;
          }
          if (station && actor.roleId !== 'press-officer') assert.equal(current.currentMemberBerthPresent,
            original.currentMemberBerthPresent, 'Original current member berth witness applicability changed.');
        }
        if (current.identityHydrationRevision > 0) {
          assert.ok(Number.isFinite(current.documentTimeOrigin) && current.documentTimeOrigin > 0,
            'Current document identity evidence is required.');
          assert.ok(Number.isSafeInteger(current.connectionGeneration) && current.connectionGeneration >= 0,
            'Current member connectionGeneration evidence is required.');
          assert.equal(current.hasAuth, true); assert.equal(current.sameActor, true);
          assert.equal(current.uidHash, actor.uidHash, 'Select the original role account, never manufacture another identity.');
          assert.equal(current.profileRoleId, actor.roleId);
          assert.equal(current.profileSessionId, initial.sessionId); assert.equal(current.sessionId, initial.sessionId);
          assert.equal(current.meSessionId, initial.sessionId); assert.equal(current.playerRole, 'player');
          assert.equal(current.connected, true);
          // Account reads bind the current nullable assignment; they grant no
          // station capability. Press has an exclusive active console, no primary
          // core assignment/seat. Escaped/reassigned actors cannot enter old roles.
          if (station) {
            assert.equal(current.escapeLocked, false, 'An escaped original account cannot enter its historical station.');
            assert.equal(current.replacementRoleId, null, 'A reassigned original account cannot enter its historical station.');
            assert.equal(current.replacementStatus, null, 'The original account awaits station reassignment.');
            if (actor.roleId === 'press-officer') {
              assert.equal(current.assignedRoleId, null, 'The original Press station has no primary assignment.');
              assert.equal(current.seatId, null, 'The original Press station has no core seat.');
            } else assert.equal(current.assignedRoleId, actor.roleId, 'The original station must remain currently assigned.');
            if (held && normalMemberRoleRequiresBerth(actor.roleId)) assert.equal(current.seatId, actor.roleId,
              'The held original core console requires its exact canonical seat pointer.');
          }
          assert.ok(typeof current.fleetGroupId === 'string' && current.fleetGroupId.length > 0,
            'The current original member fleet group is required.');
          // Normal fresh core hydration omits the transaction's envelope witness.
          // Hold this document's accepted identity while its existing feed lands;
          // absence here cannot pin the genuine legacy path prematurely.
          if (requireCurrentPressMember && current.currentMemberBerthPresent) assert.equal(current.currentPressMemberMatches,
            true, 'Current original Press member confirmation is required.');
          if ((requireCurrentBerth || requireCurrentPressMember) && !waitingOriginal) waitingOriginal = current;
          if (current.connection === 'live' && current.freshness === 'server' &&
              (!requireCurrentBerth || current.currentMemberBerthPresent) &&
              (!requireCurrentPressMember || current.currentOwnPlayerConfirmed && current.currentMemberBerthPresent && current.currentPressMemberMatches) &&
              (!station || actor.roleId === 'press-officer' || !current.currentMemberBerthPresent || current.currentMemberBerthMatches) &&
              (!held || current.activeConsoleRoleId === actor.roleId)) return current;
        }
        budget();
        await delay(Math.min(250, deadlineAt - Date.now()));
      }
      throw new Error('Original role navigation deadline expired.');
    } catch (error) {
      const heldState = { operation: 'acceptedMember', actor, original, waitingOriginal, current,
        deadlineAt, held, station, requireCurrentBerth, requireCurrentPressMember };
      consumed.member = heldState; rememberProofFailure(error, heldState);
      throw error;
    }
  }
  async function state(surface = gm) {
    const current = await surface.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl);
      const s = useSessionStore.getState();
      const session = s.session;
      const me = s.me, scope = session?.memberSessionScope, berth = session?.currentActorBerthAuthority;
      const wireId = value => typeof value === 'string' && value.length > 0 && value.length <= 1_500 && !value.includes('/');
      const nullableRole = id => id === null || wireId(id);
      const berthKeys = ['sessionId', 'actorUid', 'groupId', 'role', 'connectionGeneration',
        'assignedRoleId', 'activeConsoleRoleId', 'replacementRoleId', 'replacementStatus', 'shipId'];
      const scopeMatches = Boolean(scope && typeof scope.groupId === 'string' && /^fleet-[1-9][0-9]*$/.test(scope.groupId) &&
        scope.groupId === me?.fleetGroupId && Array.isArray(scope.vesselIds));
      const berthMatches = Boolean(session && berth && typeof berth === 'object' && !Array.isArray(berth) &&
        Object.keys(berth).length === berthKeys.length && Object.keys(berth).every(key => berthKeys.includes(key)) &&
        wireId(berth.sessionId) && wireId(berth.actorUid) && wireId(berth.shipId) &&
        typeof berth.groupId === 'string' && /^fleet-[1-9][0-9]*$/.test(berth.groupId) && berth.role === 'player' &&
        Number.isSafeInteger(berth.connectionGeneration) && berth.connectionGeneration >= 1 &&
        nullableRole(berth.assignedRoleId) && nullableRole(berth.activeConsoleRoleId) && nullableRole(berth.replacementRoleId) &&
        berth.replacementStatus === null && session.phase !== 'closed' &&
        me?.role === 'player' && me.connected === true && me.replacementStatus == null &&
        berth.sessionId === session.id && me.sessionId === session.id && berth.actorUid === me.uid &&
        scopeMatches && berth.groupId === scope.groupId && scope.vesselIds.includes(berth.shipId) &&
        berth.connectionGeneration === (me.connectionGeneration ?? 1) &&
        berth.assignedRoleId === (me.assignedRoleId ?? null) && berth.activeConsoleRoleId === (me.activeConsoleRoleId ?? null) &&
        berth.replacementRoleId === (me.replacementRoleId ?? null));
      return { sessionId: session?.id, cycle: session?.currentTurn, phase: session?.phase,
        turnLimit: session?.turnLimit, turnPhase: session?.turnPhase,
        fullGameDemo: session?.fullGameDemo, shipResources: session?.shipResources,
        shipDamage: session?.shipDamage, shipSurvivors: session?.shipSurvivors,
        activeRoleIds: session?.activeRoleIds,
        activeVesselIds: session?.activeVesselIds, maintenanceCycles: session?.maintenanceCycles,
        shuttleDockings: session?.shuttleDockings, shuttleFuelled: session?.shuttleFuelled,
        shuttleControl: session?.shuttleControl, shipGalacticCoordinates: session?.shipGalacticCoordinates,
        organiserSites: session?.organiserSites, setupRevision: session?.setupRevision,
        chartId: session?.chartId, turnState: session?.turnState,
        shipFleetGroupIds: session?.shipFleetGroupIds,
        vesselActionRevisions: session?.vesselActionRevisions, gameOutcome: session?.gameOutcome,
        debriefSnapshot: session?.debriefSnapshot,
        currentMemberGroupAuthority: { groupId: me?.fleetGroupId ?? null,
          scopePresent: !!session && Object.hasOwn(session, 'memberSessionScope'), scopeMatches,
          berthPresent: !!session && Object.hasOwn(session, 'currentActorBerthAuthority'), berthMatches,
          shipId: berthMatches ? berth.shipId : null,
          documentHydrated: Number.isSafeInteger(s.identityHydrationRevision) && s.identityHydrationRevision > 0 },
        player: { role: s.me?.role, assignedRoleId: s.me?.assignedRoleId,
          activeConsoleRoleId: s.me?.activeConsoleRoleId, replacementRoleId: s.me?.replacementRoleId },
        live: s.connection === 'live' && s.sessionSnapshotFreshness === 'server' };
    }, surface.storeModuleUrl());
    consumed.state = current; return current;
  }
  async function shipState(shipId, surface = gm) {
    const current = await surface.page.evaluate(async ({ moduleUrl, shipId }) => {
      const { useSessionStore } = await import(moduleUrl);
      const { projectShipState } = await import('/src/lib/shipStateProjection.ts');
      const snapshot = useSessionStore.getState();
      return { sessionId: snapshot.session?.id,
        live: snapshot.connection === 'live' && snapshot.sessionSnapshotFreshness === 'server',
        shipProjection: snapshot.session ? projectShipState(snapshot.session, shipId) : null };
    }, { moduleUrl: surface.storeModuleUrl(), shipId });
    consumed.ship = { shipId, current }; return current;
  }
  async function select(roleId, { enter = true, deadlineAt = Date.now() + 60_000 } = {}) {
    consumed.selection = { roleId, enter, deadlineAt, sessionId: initial.sessionId,
      started: context.started, prepared: context.prepared };
    const navigation = roleId !== 'gm' && enter && normalMemberRoleRequiresBerth(roleId)
      ? createMemberNavigationResumeObserver(crew.page, { directory, roleId, deadlineAt }) : null;
    let selectionError;
    try {
      const navigationTimeout = () => {
        assert.ok(Number.isFinite(deadlineAt) && Date.now() < deadlineAt, 'Original role navigation deadline expired.');
        return Math.max(1, Math.min(35_000, deadlineAt - Date.now()));
      };
      if (roleId === 'gm') { await live(gm, deadlineAt); return gm; }
      const actor = roster.find(value => value.roleId === roleId);
      consumed.selection.actor = actor;
      assert.ok(actor, `${roleId} must be a genuinely admitted account in this fresh roster.`);
      const current = await crew.observe();
      consumed.selection.currentGeneric = current;
      if (current.profileRoleId !== roleId) {
        const url = new URL(crew.page.url());
        url.search = '';
        url.searchParams.set('demoActor', `${initial.sessionId}~${roleId}`);
        url.searchParams.set('demoJoin', initial.joinCode);
        url.hash = '/demo-actors';
        await crew.page.goto(url.href, { timeout: navigationTimeout() });
      }
      const marker = context.started?.fullGameDemo ?? context.prepared?.fullGameDemo;
      const freshManualDemo = marker && typeof marker === 'object' && !Array.isArray(marker) &&
        Object.keys(marker).length === 2 && ['preparing', 'active'].includes(marker.status) && marker.progression === 'manual';
      const requireCurrentBerth = Boolean(enter && freshManualDemo && normalMemberRoleRequiresBerth(roleId));
      const requireCurrentPressMember = Boolean(enter && freshManualDemo && roleId === 'press-officer');
      let actual = await acceptedMember(actor, deadlineAt, { station: enter, requireCurrentBerth, requireCurrentPressMember, navigation });
      await navigation?.prepare(actual);
      consumed.selection.navigationEvidencePath = navigation?.path;
      consumed.selection.originalMember = actual;
      assert.equal(actual.profileRoleId, roleId);
      assert.equal(actual.uidHash, actor.uidHash, 'Select the original role account, never manufacture another identity.');
      const onRoleRoute = () => {
        const path = new URL(crew.page.url()).hash;
        return roleId === 'press-officer' ? path === '#/press'
          : /^#\/(?:ships\/[^/]+|union)\/roles\//.test(path) && path.endsWith(`/roles/${roleId}`);
      };
      async function originalAccount({ held = false } = {}) {
        assert.ok(Date.now() < deadlineAt, 'Original role navigation deadline expired.');
        const current = await crew.observe();
        consumed.selection.currentGeneric = current;
        assert.equal(current.uidHash, actor.uidHash); assert.equal(current.profileRoleId, roleId);
        assert.equal(current.sessionId, initial.sessionId); assert.equal(current.hasAuth, true); assert.equal(current.sameActor, true);
        const member = await acceptedMember(actor, deadlineAt, { original: actual, held, station: enter, requireCurrentPressMember, navigation });
        consumed.selection.currentMember = member;
        actual = member; navigation?.bind(member);
      }
      if (enter && (actual.activeConsoleRoleId !== roleId || !onRoleRoute())) {
        for (let hop = 0; hop < 4 && !onRoleRoute(); hop++) {
          await originalAccount();
          const path = new URL(crew.page.url()).hash;
          let link;
          if (path === '#/demo-actors') link = crew.page.getByRole('link', { name: "Enter this actor's stations", exact: true });
          else if (path === '#/brief') link = crew.page.getByRole('link', { name: 'Back to stations', exact: true });
          else if (path.startsWith('#/shuttles/')) link = crew.page.getByRole('link', { name: /^Back to / }).first();
          else if (path === '#/console' || /^#\/ships\/[^/]+\/roles$/.test(path)) {
            link = roleId === 'press-officer' ? crew.page.getByRole('link', { name: 'Press Officer', exact: true })
              : crew.page.locator(`a[href$="/roles/${roleId}"]`);
            if (path !== '#/console' && !(await link.isVisible())) link = crew.page.getByRole('link', { name: 'Back to fleet', exact: true });
          } else link = crew.page.getByRole('link', { name: /^(?:Back to (?:stations|role selection)|View ship consoles|Change role|Leave ship)$/ }).first();
          await link.waitFor({ state: 'visible', timeout: navigationTimeout() });
          await originalAccount(); await link.click();
          await crew.page.waitForURL(url => url.hash !== path, { timeout: navigationTimeout() });
          await originalAccount();
        }
        assert.ok(onRoleRoute(), 'Normal Back and chooser navigation must reach the original role console.');
        await crew.until(`The actual ${roleId} console is held`, value =>
          value.activeConsoleRoleId === roleId && value.uidHash === actor.uidHash && value.profileRoleId === roleId &&
          value.sessionId === initial.sessionId && value.sameActor && value.connection === 'live' && value.freshness === 'server',
        Math.max(1, deadlineAt - Date.now()));
        await originalAccount();
      }
      await originalAccount({ held: enter });
      return crew;
    } catch (error) {
      selectionError = error; rememberProofFailure(error, { operation: 'select', ...consumed }); throw error;
    } finally {
      try { await navigation?.finish(selectionError); }
      catch (error) {
        if (!selectionError) throw error;
        rememberProofFailure(selectionError, { operation: 'member-navigation-evidence', error });
      }
    }
  }
  async function command(roleId, name, fields = {}, { instance = roleId === 'gm' } = {}) {
    const surface = await select(roleId);
    const observed = await live(surface);
    const payload = { sessionId: initial.sessionId,
      ...(instance ? { instanceId: observed.instanceId } : {}), ...fields };
    const startedAt = new Date().toISOString();
    const reply = await surface.callable(name, payload);
    actions.push({ roleId, name, startedAt, completedAt: new Date().toISOString(),
      transport: 'real browser Firebase SDK in the currently selected account',
      status: reply.status, code: reply.code, requestFingerprint: hash(payload),
      resultStatus: reply.result?.status });
    assert.equal(reply.status, 'committed', `${roleId}/${name}: ${reply.code ?? ''} ${reply.message ?? ''}`);
    return reply.result;
  }
  async function read(roleId, suffix, { collection = false } = {}) {
    const surface = await select(roleId, { enter: false });
    await live(surface);
    const outcome = await surface.page.evaluate(async ({ sid, suffix, collection }) => {
      try {
        const source = await (await fetch('/src/lib/firestore.ts')).text();
        const match = source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);
        if (!match) throw new Error('Read the actual current browser SDK import before the entitled read.');
        const sdk = await import(match[1]);
        const { db } = await import('/src/lib/firestore.ts');
        const path = `sessions/${sid}/${suffix}`;
        const value = collection
          ? (await sdk.getDocs(sdk.collection(db(), path))).docs.map(document =>
            ({ id: document.id, ...document.data() }))
          : await sdk.getDoc(sdk.doc(db(), path)).then(document =>
            document.exists() ? { id: document.id, ...document.data() } : null);
        return { status: 'ok', value };
      } catch (error) {
        return { status: 'error', code: typeof error?.code === 'string' ? error.code : null };
      }
    }, { sid: initial.sessionId, suffix, collection });
    return unwrapBrowserFirestoreReadOutcome(outcome);
  }
  async function readCurrentWolfAttackFromServer(roleId, suffix, { deadlineAt, onSnapshot, collection = false }) {
    assert.ok(roleId === 'gm' && suffix === 'wolfAttackState/current' && collection === false,
      'Server-only combat reinspection uses only the entitled GM original attack document.');
    const budget = () => assert.ok(Number.isFinite(deadlineAt) && Date.now() < deadlineAt,
      'The original combat source reinspection deadline expired.');
    budget();
    const surface = await select('gm', { enter: false, deadlineAt }); budget();
    await live(surface, deadlineAt); budget();
    const outcome = await surface.page.evaluate(async sid => {
      try {
        const source = await (await fetch('/src/lib/firestore.ts')).text();
        const match = source.match(/from\s+["']([^"']*firebase_firestore\.js[^"']*)["']/);
        if (!match) throw new Error('Read the actual current browser SDK import before the entitled read.');
        const sdk = await import(match[1]);
        const { db } = await import('/src/lib/firestore.ts');
        const document = await sdk.getDocFromServer(sdk.doc(db(), `sessions/${sid}/wolfAttackState/current`));
        return { status: 'ok', value: document.exists() ? { id: document.id, ...document.data() } : null,
          metadata: { fromCache: document.metadata?.fromCache ?? null,
            hasPendingWrites: document.metadata?.hasPendingWrites ?? null } };
      } catch (error) {
        return { status: 'error', code: typeof error?.code === 'string' ? error.code : null };
      }
    }, initial.sessionId);
    // Retain only the already completed read. Its observer does not authorize
    // a cache fallback, a second read, or acceptance of a pending local write.
    await onSnapshot?.(outcome); budget();
    if (outcome?.status === 'ok') {
      assert.ok(hasExactKeys(outcome, ['status', 'value', 'metadata']) &&
        hasExactKeys(outcome.metadata, ['fromCache', 'hasPendingWrites']) &&
        outcome.metadata.fromCache === false && outcome.metadata.hasPendingWrites === false,
      'The original combat reinspection requires a server snapshot without pending local writes.');
      return unwrapBrowserFirestoreReadOutcome({ status: 'ok', value: outcome.value });
    }
    return unwrapBrowserFirestoreReadOutcome(outcome);
  }
  async function ui(roleId, description, decision) {
    const surface = await select(roleId);
    await live(surface);
    await decision(surface.page);
    actions.push({ roleId, description, transport: 'actual connected UI control',
      at: new Date().toISOString(), path: new URL(surface.page.url()).hash });
  }
  async function maintenanceUi(shipId, roleId, { consoles = ['Jump Drive'], refuels = {}, afterBegin, afterRiot } = {}) {
    const surface = await select(roleId);
    const maintenancePage = surface.page.getByRole('button', { name: 'Maintenance', exact: true });
    const panel = surface.page.getByRole('region', { name: / maintenance cycle$/i }).first();
    await maintenancePage.or(panel).first().waitFor();
    if (!(await panel.isVisible()) && await maintenancePage.isVisible()) await maintenancePage.click();
    await panel.waitFor();
    const before = await state();
    const originalActor = await surface.observe();
    assert.equal(before.turnPhase.airspace.state, 'restricted');
    async function execute(button) {
      const response = await observeUiReceipt({ page: surface.page,
        waitForResponse: () => surface.page.waitForResponse(response => response.request().method() === 'POST' &&
          new URL(response.url()).pathname.endsWith('/us-central1/runMaintenance')),
        choose: () => button.click(),
      });
      const body = await response.json();
      const request = response.request().postDataJSON()?.data;
      const entry = { roleId, shipId, endpoint: 'runMaintenance', cycle: before.cycle,
        action: request?.action, expectedRevision: request?.expectedRevision,
        requestFingerprint: hash(request), resultFingerprint: hash(body.result),
        httpStatus: response.status(), status: body.result?.status,
        revision: body.result?.cycle?.revision, returnedStep: body.result?.cycle?.step,
        uidHash: originalActor.uidHash, synchronization: 'pending',
        transport: 'captured actual connected UI request and unmodified server reply' };
      actions.push(entry);
      await save('maintenance-ui-progress.json');
      assert.equal(response.status(), 200, `Real ${shipId} maintenance: ${JSON.stringify(body)}`);
      assert.equal(body.result?.status, 'committed');
      const revision = body.result.cycle.revision;
      await waitForMaintenanceReceipt({ shipId, cycle: before.cycle, revision, expectedActor: originalActor,
        expectedMaintenance: body.result.cycle,
        inspectGm: () => shipState(shipId), inspectCrew: () => shipState(shipId, surface), inspectActor: () => surface.observe(),
        inspectRendered: () => panel.evaluate(element => {
          const current = [...element.querySelectorAll('ol[aria-label$=" maintenance sequence"] li[aria-current="step"]')];
          return { currentStep: current.length === 0 ? null : current.length === 1
            ? Number(current[0].querySelector('.maintenance-systems__step > span')?.textContent) : 'ambiguous',
          endEnabled: [...element.querySelectorAll('button')].some(button =>
            button.textContent?.trim() === 'End maintenance cycle' && !button.disabled),
          results: [...element.querySelectorAll('[role="status"]')].map(status => status.textContent ?? '') };
        }) });
      entry.synchronization = 'original crew and GM ship projections plus rendered step/results matched';
      await save('maintenance-ui-progress.json');
      console.log(JSON.stringify({ maintenanceStage: 'actual normal UI committed', roleId, shipId,
        cycle: before.cycle, action: request?.action, revision }));
    }
    await panel.getByRole('button', { name: `Begin Maintenance Cycle: Cycle ${before.cycle}`, exact: true }).click();
    await execute(panel.getByRole('button', { name: 'ARE YOU SURE?', exact: true }));
    await afterBegin?.();
    await execute(panel.getByRole('button', { name: 'Check storage', exact: true }));
    for (const [label, resource] of [['Food', 'food'], ['Water', 'water']]) {
      const options = await panel.getByLabel(`${label} ration level`, { exact: true }).locator('option').evaluateAll(nodes =>
        nodes.map(node => ({ value: node.value, cost: Number(node.textContent.split('//')[1]?.trim()) })));
      const liveStores = (await state()).shipResources[shipId][resource];
      const affordable = options.filter(option => Number.isFinite(option.cost) && option.cost <= liveStores).at(-1);
      assert.ok(affordable, 'Use a ration choice actually displayed and affordable in this live game.');
      await panel.getByLabel(`${label} ration level`, { exact: true }).selectOption(affordable.value);
    }
    await execute(panel.getByRole('button', { name: 'Proceed with rations', exact: true }));
    await execute(panel.getByRole('button', { name: 'Run unrest check', exact: true }));
    await execute(panel.getByRole('button', { name: 'Run riot check', exact: true }));
    await afterRiot?.();
    for (const name of consoles) await panel.getByRole('checkbox', { name: new RegExp(`^${name}(?: \\/\\/ Charged)?$`, 'i') }).check();
    await panel.getByRole('button', { name: 'Power up reactor', exact: true }).click();
    await execute(panel.getByRole('button', { name: 'ARE YOU SURE?', exact: true }));
    const production = panel.getByRole('group', { name: / production consoles$/i });
    const productionNames = await production.getByRole('button', { name: /^Run / }).allTextContents();
    for (const name of productionNames) {
      const run = production.getByRole('button', { name: name.trim(), exact: true });
      if (await run.isEnabled()) await execute(run);
      else {
        const skip = production.getByRole('button', { name: name.trim().replace(/^Run /, 'Skip '), exact: true });
        if (await skip.isEnabled()) await execute(skip);
      }
    }
    for (const [label, craftId] of Object.entries(refuels)) {
      await panel.getByLabel(`${label} refuelling`, { exact: true }).selectOption(craftId);
    }
    await execute(panel.getByRole('button', { name: 'Proceed with refuelling', exact: true }).and(surface.page.locator(':enabled')).first());
    if (shipId === 'aegis') await execute(panel.getByRole('button', { name: 'Proceed with refuelling', exact: true }).and(surface.page.locator(':enabled')).first());
    await execute(panel.getByRole('button', { name: 'End maintenance cycle', exact: true }));
    const completedDeadline = Date.now() + 60_000;
    let completed;
    while (Date.now() < completedDeadline) {
      completed = (await state()).maintenanceCycles?.[shipId];
      if (completed?.turn === before.cycle && completed.step === 0 && completed.completedAt) break;
      await delay(200);
    }
    assert.ok(completed?.turn === before.cycle && completed.step === 0 && completed.completedAt,
      `${shipId} actual maintenance must finish this cycle.`);
    const after = await state();
    snapshots.push({ description: `${shipId} actual UI maintenance`, before: before.shipResources[shipId],
      after: after.shipResources[shipId], cycle: before.cycle });
    actions.push({ roleId, name: 'runMaintenance', description: 'Begin, storage, affordable rations, unrest, riot, deliberate reactor, bays and end via UI',
      transport: 'actual connected UI control', cycle: before.cycle });
    return after.maintenanceCycles[shipId];
  }
  async function save(name = 'two-browser-gameplay-actions.json', details = {}) {
    await writeFile(`${directory}/${name}`, `${JSON.stringify(candidateEvidenceEnvelope({
      limitations: ['Explicit SDK actions are separately labeled from connected UI actions.',
        'No function or full-game acceptance follows from the adapter itself.'],
      actions, snapshots, ...details }), null, 2)}\n`);
  }
  // The setup producer has not confirmed or admitted crew yet. Keep its real
  // GM-only callback in Cycle 0 without enabling any crew/SDK gameplay helper.
  if (preAdmissionGmOnly) return { context, actions,
    select: async (roleId, options) => {
      assert.equal(roleId, 'gm', 'The pre-admission adapter permits only the original GM.');
      return select(roleId, options);
    },
    state: async (surface = gm) => {
      assert.equal(surface, gm, 'The pre-admission adapter reads only the original GM.');
      const current = await state(surface);
      assert.equal(current.live, true); assert.equal(current.sessionId, initial.sessionId);
      assert.equal(current.phase, 'lobby'); assert.equal(current.cycle, 0); assert.equal(current.player.role, 'gm');
      return current;
    } };
  return { context, actions, state, shipState, select, command,
    consumedObservations: () => consumed,
    read: (roleId, suffix, options) => options?.serverOnly === true
      ? readCurrentWolfAttackFromServer(roleId, suffix, options) : read(roleId, suffix, options),
    ui, maintenanceUi, save };
}
