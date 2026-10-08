import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { summarizeWolfTargetDiagnosticSample } from './pc10-combat-target-diagnostics.mjs';

const identityKeys = ['sessionId', 'uidHash', 'profileRoleId', 'assignedRoleId', 'activeConsoleRoleId', 'playerRole', 'phase', 'cycle',
  'fleetGroupId', 'connectionGeneration', 'identityHydrationRevision', 'replacementRoleId', 'replacementStatus', 'seatId',
  'airspace', 'turnStatePhase', 'phaseProgression'];
// Only this module's factory can register a returned SDK denial, for that exact
// read function. Caller-owned errors and reused tags never acquire recovery.
const closedBoardingReadDenials = new WeakMap();

function originalIdentity(current, original) {
  for (const key of identityKeys)
    assert.equal(current[key], original[key], `Original combat ${key} changed.`);
  assert.equal(current.hasAuth, true); assert.equal(current.sameActor, true);
  if (original.playerRole === 'gm') {
    assert.ok(original.instanceId); assert.equal(current.instanceId, original.instanceId);
    assert.equal(current.gmInstanceOwned, true);
  }
  if (original.boardingDiscoveryAuthority) {
    assert.equal(current.entitledShipId, original.entitledShipId, 'Original combat discovery ship changed.');
    assert.deepEqual(current.discoveryAuthority, original.boardingDiscoveryAuthority,
      'Original combat discovery authority changed.');
  }
}
const live = actor => actor.connection === 'live' && actor.freshness === 'server';
const attackKeys = ['attackId', 'turn', 'revision', 'status', 'currentStep'];
const sameAttack = (value, expected) => value && attackKeys.every(key => value[key] === expected[key]);

export function assertWolfChoiceActor(current, original) {
  originalIdentity(current, original);
  assert.equal(live(current), true, 'The original combat actor must remain a live server projection.');
}

function assertClosedReadWindow(current, original) {
  const unchanged = current.airspace === original.airspace && current.turnStatePhase === original.turnStatePhase;
  const restored = original.airspace === 'restricted' && current.airspace === 'lifted' &&
    ['team', 'coordination'].includes(original.turnStatePhase) && current.turnStatePhase === 'coordination';
  assert.ok(unchanged || restored, 'Original combat airspace/turnStatePhase has no proven full forward restoration.');
}

function assertClosedReadAuthority(current, original, expected) {
  for (const key of [...identityKeys, 'discoveryAuthority', 'entitledShipId'])
    assert.ok(Object.hasOwn(original, key) && original[key] !== undefined,
      `Closed boarding recovery requires original ${key} evidence.`);
  assert.equal(original.hasAuth, true); assert.equal(original.sameActor, true);
  assert.equal(live(original), true); assert.ok(original.uidHash);
  assert.equal(original.sessionId, expected.sessionId); assert.equal(original.phase, 'active');
  assert.equal(original.phaseProgression, 'manual'); assert.equal(original.cycle, expected.turn);
  assert.equal(original.airspace, 'restricted');
  assert.ok(['team', 'coordination'].includes(original.turnStatePhase));
  for (const key of ['connectionGeneration', 'identityHydrationRevision'])
    assert.ok(Number.isSafeInteger(original[key]) && original[key] >= 0, `Original ${key} evidence is required.`);
  if (original.discoveryAuthority !== null) {
    const discovery = original.discoveryAuthority, vessels = discovery.fleetGroupVesselIds;
    assert.equal(discovery.groupId, original.fleetGroupId);
    assert.ok(Number.isSafeInteger(discovery.revision) && discovery.revision >= 0);
    assert.ok(Array.isArray(vessels) && vessels.every(id => typeof id === 'string' && id) &&
      new Set(vessels).size === vessels.length);
  }
  if (original.playerRole === 'gm') assert.equal(original.gmInstanceOwned, true);
  // A full forward window is only a candidate until the single reinspection
  // below proves this exact original attack resolved and unlocked. Every
  // non-window identity, lease and audience field remains exact here.
  assertClosedReadWindow(current, original);
  assertWolfChoiceActor({ ...current, airspace: original.airspace, turnStatePhase: original.turnStatePhase }, original);
  assert.equal(current.entitledShipId, original.entitledShipId);
  assert.deepEqual(current.discoveryAuthority, original.discoveryAuthority, 'Original combat discovery authority changed.');
}

/** Extra read-only fields bind the mounted controller's current audience/lease, without changing the generic driver. */
export async function observeWolfChoiceActor(surface, recordTargetDiagnostic) {
  const before = await surface.observe();
  const sampled = await surface.page.evaluate(recordTargetDiagnostic ? async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const snapshot = useSessionStore.getState(), me = snapshot.me;
    const discovery = snapshot.session?.playerDiscovery;
    const session = snapshot.session, gm = snapshot.gmInstance;
    const stateOf = (object, key) => !object || !Object.hasOwn(object, key) ? 'absent'
      : object[key] === null ? 'null' : typeof object[key] === 'object' && !Array.isArray(object[key]) ? 'object' : 'malformed';
    const projection = (key, keys) => {
      const value = session?.[key], state = stateOf(session, key);
      return { state, keys: state === 'object' ? Object.keys(value).sort() : [],
        values: keys.map(field => [field, state === 'object' && Object.hasOwn(value, field),
          state === 'object' ? value[field] ?? null : null]) };
    };
    const hasDom = typeof document !== 'undefined' && typeof document.querySelectorAll === 'function';
    const hasVisibility = hasDom && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function';
    const text = node => node?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
    const visible = node => {
      if (!hasVisibility || !node?.isConnected || node.getClientRects().length === 0) return false;
      for (let parent = node; parent; parent = parent.parentElement) {
        const style = window.getComputedStyle(parent);
        if (parent.hidden || parent.getAttribute('aria-hidden') === 'true' || style.display === 'none' ||
            style.visibility === 'hidden' || style.visibility === 'collapse') return false;
      }
      return true;
    };
    const panels = hasDom ? [...document.querySelectorAll('[aria-label="Wolf range actions"]')].map(panel => ({
      label: panel.getAttribute('aria-label'), visible: visible(panel), cycle: text(panel.querySelector('.eyebrow')),
      range: text(panel.querySelector('h2')), status: text(panel.querySelector('.wolf-range-action__status')),
      deadlines: [...panel.querySelectorAll('time')].map(node => [node.getAttribute('datetime'), text(node)]),
      fields: [...panel.querySelectorAll('select')].map(node => ({ label: node.getAttribute('aria-label'),
        value: node.value, selectedValues: [...node.selectedOptions].map(option => option.value),
        options: [...node.options].map(option => ({ value: option.value, text: text(option), disabled: option.disabled })),
        connected: node.isConnected, visible: visible(node), enabled: !node.matches(':disabled'), multiple: node.multiple })),
      commits: [...panel.querySelectorAll('button')].filter(node => text(node) === 'Commit target assignments')
        .map(node => ({ visible: visible(node), enabled: !node.matches(':disabled') })),
    })) : [];
    const craft = [session?.smallShipStates?.gorgoneion?.hostShipId ?? null,
      session?.smallShipStates?.gorgoneion?.dockingRevision ?? null];
    const phase = [session?.phase ?? null, session?.currentTurn ?? null, session?.turnState?.currentTurn ?? null,
      session?.turnState?.phase ?? null, session?.turnState?.phaseRevision ?? null, session?.turnPhase?.turn ?? null,
      session?.turnPhase?.airspace?.state ?? null, session?.turnPhase?.airspace?.pressAccess ?? null,
      session?.turnPhase?.timerPause ?? null, session?.pursuitEmergencyWindow ?? null];
    const member = [me?.sessionId ?? null, me?.uid ?? null, me?.connectionGeneration ?? null, me?.role ?? null,
      me?.connected ?? null, me?.replacementRoleId ?? null, me?.replacementStatus ?? null, me?.assignedRoleId ?? null,
      me?.activeConsoleRoleId ?? null, me?.seatId ?? null, me?.fleetGroupId ?? null, snapshot.identityHydrationRevision];
    const targetDiagnosticSample = { wallClockMs: Date.now(),
      documentTimeOrigin: typeof performance === 'undefined' ? null : performance.timeOrigin ?? null,
      monotonicMs: typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : null,
      // Exact EO controller inputs; no current hook/member-view/form state is
      // accessible here and no diagnostic input grants authority to submit.
      controllerAuthorityInput: ['executive-officer', session?.id ?? null, session?.id ?? null, ...phase, ...member,
        gm?.sessionId ?? null, gm?.uid ?? null, gm?.id ?? null, discovery?.groupId ?? null,
        discovery?.shipId ?? null, discovery?.revision ?? null, discovery?.fleetGroupVesselIds ?? [], ...craft,
        snapshot.connection, snapshot.sessionSnapshotFreshness, typeof navigator === 'undefined' || navigator.onLine, true],
      member, phase, craft,
      discovery: projection('playerDiscovery', ['groupId', 'shipId', 'revision', 'fleetGroupVesselIds']),
      berth: projection('currentActorBerthAuthority', ['sessionId', 'actorUid', 'groupId', 'role', 'connectionGeneration',
        'assignedRoleId', 'activeConsoleRoleId', 'replacementRoleId', 'replacementStatus', 'shipId']),
      memberScope: projection('memberSessionScope', ['groupId', 'vesselIds']),
      dom: { available: hasDom, visibilityAvailable: hasVisibility, panels } };
    return { sessionId: snapshot.session?.id ?? null, fleetGroupId: me?.fleetGroupId ?? null,
      connectionGeneration: me?.connectionGeneration ?? null,
      identityHydrationRevision: snapshot.identityHydrationRevision ?? null,
      replacementRoleId: me?.replacementRoleId ?? null, replacementStatus: me?.replacementStatus ?? null,
      seatId: me?.seatId ?? null, connected: me?.connected !== false,
      // Only the audience tuple used by the source controller; no coordinates,
      // systems, candidate names, navigation logs, cards or private contacts.
      discoveryAuthority: discovery ? { groupId: discovery.groupId, shipId: discovery.shipId ?? null,
        revision: discovery.revision, fleetGroupVesselIds: [...(discovery.fleetGroupVesselIds ?? [])] } : null,
      targetDiagnosticSample };
  } : async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const snapshot = useSessionStore.getState(), me = snapshot.me;
    const discovery = snapshot.session?.playerDiscovery;
    return { sessionId: snapshot.session?.id ?? null, fleetGroupId: me?.fleetGroupId ?? null,
      connectionGeneration: me?.connectionGeneration ?? null,
      identityHydrationRevision: snapshot.identityHydrationRevision ?? null,
      replacementRoleId: me?.replacementRoleId ?? null, replacementStatus: me?.replacementStatus ?? null,
      seatId: me?.seatId ?? null, connected: me?.connected !== false,
      // Only the audience tuple used by the source controller; no coordinates,
      // systems, candidate names, navigation logs, cards or private contacts.
      discoveryAuthority: discovery ? { groupId: discovery.groupId, shipId: discovery.shipId ?? null,
        revision: discovery.revision, fleetGroupVesselIds: [...(discovery.fleetGroupVesselIds ?? [])] } : null };
  }, surface.storeModuleUrl());
  const { targetDiagnosticSample, ...authority } = sampled;
  if (recordTargetDiagnostic) recordTargetDiagnostic(summarizeWolfTargetDiagnosticSample(targetDiagnosticSample));
  const after = await surface.observe(); originalIdentity(after, before);
  assert.equal(authority.sessionId, before.sessionId); assert.equal(authority.connected, true);
  // Protected discovery uses the server's current member berth, not the role
  // catalog. The existing boarding getter must independently match this ship.
  return { ...after, ...authority, entitledShipId: authority.replacementStatus == null
    ? authority.discoveryAuthority?.shipId ?? null : null };
}

export function wolfChoiceSourceReason(view) {
  if (view?.type?.endsWith('-unavailable')) return view.reason;
  if (view?.choiceStatus === 'launched') return 'already-launched';
  if (view?.choiceStatus && !['pending', 'targets-required'].includes(view.choiceStatus)) return view.choiceStatus;
  if (view?.destroyed === true && view?.range) return 'destroyed';
  if (view?.launched === false && view?.range) return 'not-launched';
  if (view?.launched === true && !view?.range) return 'already-launched';
  if (view?.eligible === false) return view.reason ?? 'not-current-holder';
  return undefined;
}

/** One original actor, one entitled read, and current control paint share the existing stage budget. */
export async function waitForWolfChoiceReadiness({ original, expected, inspectActor, inspectAttack,
  originalGm, inspectGm, readChoice, inspectPaint, timeoutMs = 60_000, deadlineAt = Infinity,
  requireBoardingDiscovery = false, now = Date.now, wait = () => delay(200) }) {
  assert.ok(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60_000, 'Combat readiness has at most the existing60s budget.');
  assert.ok(expected.attackId && Number.isSafeInteger(expected.revision) && expected.revision >= 1);
  const deadline = Math.min(now() + timeoutMs, deadlineAt);
  const budget = () => { if (now() >= deadline) throw new Error('Current combat choice readiness deadline expired; no actor reload, mutation or credit.'); };
  let view, sourceRead = false, lastAttackReadAt, boardingActor, resolvedSource;
  const sourceChanged = () => ({ status: 'source-changed', expected, gameplayCredit: false });
  async function closedReadSourceChange(error) {
    const denial = closedBoardingReadDenials.get(error);
    if (!denial || denial.readChoice !== readChoice) throw error;
    closedBoardingReadDenials.delete(error);
    try {
      budget();
      assert.ok(typeof expected.sessionId === 'string' && expected.sessionId);
      assert.ok(Number.isSafeInteger(expected.turn) && expected.turn >= 1);
      assert.equal(expected.status, 'declared'); assert.equal(expected.currentStep, 'boarding');
      assert.equal(expected.airspaceLocked, true);
      assert.ok(originalGm && inspectGm && denial.originalGm && denial.inspectGm,
        'Original GM read authority is required for closed boarding recovery.');
      // The richer GM read may already see restoration after the waiter's last
      // raw authority check. Its lease/audience stays bound to that observation;
      // its combat window stays bound to the original waiter, never renewed.
      const readOriginalGm = { ...denial.originalGm,
        airspace: originalGm.airspace, turnStatePhase: originalGm.turnStatePhase };
      let priorActor = original, priorGm = originalGm, priorReadGm = denial.originalGm;
      const strictAuthority = async () => {
        budget();
        const actor = await inspectActor(); budget();
        assertClosedReadAuthority(actor, original, expected);
        assertClosedReadWindow(actor, priorActor);
        const gm = await inspectGm(); budget();
        assertClosedReadWindow(gm, priorGm);
        assertWolfChoiceActor({ ...gm, airspace: originalGm.airspace, turnStatePhase: originalGm.turnStatePhase }, originalGm);
        const readGm = await denial.inspectGm(); budget();
        assert.equal(denial.originalGm.playerRole, 'gm');
        for (const key of identityKeys) if (!['airspace', 'turnStatePhase'].includes(key) && Object.hasOwn(originalGm, key))
          assert.equal(denial.originalGm[key], originalGm[key], `Original GM read ${key} changed.`);
        assert.equal(denial.originalGm.instanceId, originalGm.instanceId);
        assertClosedReadAuthority(denial.originalGm, readOriginalGm, expected);
        assertClosedReadAuthority(readGm, readOriginalGm, expected);
        assertClosedReadWindow(readGm, priorReadGm);
        priorActor = actor; priorGm = gm; priorReadGm = readGm;
      };
      await strictAuthority();
      // Exactly one GM read of the original session path, inside this same
      // deadline. There is no SDK retry, polling, paint or mutation here.
      const current = await inspectAttack({ serverOnly: true }); budget();
      assert.ok(current && (!Object.hasOwn(current, 'sessionId') || current.sessionId === expected.sessionId) &&
        current.attackId === expected.attackId && current.turn === expected.turn &&
        Number.isSafeInteger(current.revision) && current.revision > expected.revision &&
        current.status === 'resolved' && current.currentStep === 'resolved' && current.airspaceLocked === false,
      'The denied boarding read requires the same newer resolved, unlocked attack.');
      await strictAuthority(); budget();
      return { ...sourceChanged(), readDenial: denial.readDenial, actionCredit: false, acceptanceCredit: false };
    } catch (failure) {
      throw new Error(`Closed boarding source reinspection failed: ${failure.message}`, { cause: error });
    }
  }
  async function authority() {
    budget();
    const actor = await inspectActor(); budget();
    // Check every identity, audience, lease and phase field before a private
    // source read. Attack finalization restores its locked Team/restricted
    // projection to Coordination/lifted in the same manual cycle.
    originalIdentity({ ...actor, airspace: original.airspace, turnStatePhase: original.turnStatePhase }, original);
    const gm = inspectGm ? await inspectGm() : null;
    if (gm) { originalIdentity({ ...gm, airspace: originalGm.airspace, turnStatePhase: originalGm.turnStatePhase }, originalGm); budget(); }
    if (!live(actor) || gm && !live(gm)) return false;
    const projections = [[actor, original], ...(gm ? [[gm, originalGm]] : [])];
    const changedWindow = projections.filter(([current, bound]) =>
      current.airspace !== bound.airspace || current.turnStatePhase !== bound.turnStatePhase);
    const forwardResolutionWindow = ([value, bound]) => bound.airspace === 'restricted' && value.airspace === 'lifted' &&
      (value.turnStatePhase === bound.turnStatePhase || bound.turnStatePhase === 'team' && value.turnStatePhase === 'coordination');
    if (changedWindow.length) {
      if (!changedWindow.every(forwardResolutionWindow))
        for (const [value, bound] of projections) originalIdentity(value, bound);
      const current = await inspectAttack(); budget();
      if (gm && changedWindow.every(forwardResolutionWindow) &&
          typeof expected.sessionId === 'string' && expected.sessionId && expected.status !== 'resolved' &&
          original.sessionId === expected.sessionId && originalGm.sessionId === expected.sessionId &&
          // The real private document has no sessionId field: its original
          // authenticated GM reader uses this session's exact document path.
          current && (!Object.hasOwn(current, 'sessionId') || current.sessionId === expected.sessionId) &&
          current.attackId === expected.attackId &&
          current.turn === expected.turn && Number.isSafeInteger(current.revision) && current.revision > expected.revision &&
          current.status === 'resolved' && current.currentStep === 'resolved' && current.airspaceLocked === false) {
        const afterActor = await inspectActor(); budget();
        originalIdentity({ ...afterActor, airspace: original.airspace, turnStatePhase: original.turnStatePhase }, original);
        const afterGm = await inspectGm(); budget();
        originalIdentity({ ...afterGm, airspace: originalGm.airspace, turnStatePhase: originalGm.turnStatePhase }, originalGm);
        if (!live(afterActor) || !live(afterGm)) return false;
        for (const [value, bound] of [[afterActor, original], [afterGm, originalGm]])
          if ((value.airspace !== bound.airspace || value.turnStatePhase !== bound.turnStatePhase) &&
              !forwardResolutionWindow([value, bound])) originalIdentity(value, bound);
        // This ends the obsolete choice inspection with zero gameplay credit.
        // The caller must independently read and verify the final attack.
        resolvedSource = current; return false;
      }
      // Any other window change retains the original hard assertion.
      for (const [value, bound] of projections) originalIdentity(value, bound);
    }
    if (requireBoardingDiscovery) {
      if (boardingActor) originalIdentity(actor, boardingActor);
      else {
        const discovery = actor.discoveryAuthority, vessels = discovery?.fleetGroupVesselIds;
        if (actor.playerRole !== 'player' || !actor.fleetGroupId || !actor.entitledShipId ||
            discovery?.groupId !== actor.fleetGroupId || discovery.shipId !== actor.entitledShipId ||
            !Number.isSafeInteger(discovery.revision) || discovery.revision < 0 ||
            !Array.isArray(vessels) || vessels.some(id => typeof id !== 'string' || !id) ||
            new Set(vessels).size !== vessels.length || !vessels.includes(actor.entitledShipId)) return false;
        boardingActor = { ...original, entitledShipId: actor.entitledShipId,
          boardingDiscoveryAuthority: { ...discovery, fleetGroupVesselIds: [...vessels] } };
      }
    }
    return true;
  }
  while (now() < deadline) {
    if (!(await authority())) { if (resolvedSource) return sourceChanged(); await wait(); continue; }
    if (!sourceRead) {
      const current = await inspectAttack(); budget(); lastAttackReadAt = now();
      if (!sameAttack(current, expected)) return { status: 'source-changed', expected, gameplayCredit: false };
      if (!(await authority())) { if (resolvedSource) return sourceChanged(); await wait(); continue; }
      try { view = await readChoice(); }
      catch (error) { return closedReadSourceChange(error); }
      budget(); sourceRead = true;
      assert.ok(view && typeof view === 'object', 'The current actor source reply is required.');
      assert.equal(view.sessionId, expected.sessionId, 'Current source sessionId must match.');
      if (!view.type?.endsWith('-unavailable')) {
        assert.equal(view.turn, expected.turn, 'Normal current actor source turn is required.');
        assert.equal(view.revision, expected.revision, 'Normal current actor source revision is required.');
        if (requireBoardingDiscovery) assert.equal(view.targetShipId, boardingActor.boardingDiscoveryAuthority.shipId,
          'Current boarding source ship must match original discovery.');
      }
      for (const key of ['attackId', 'turn', 'revision']) if (Object.hasOwn(view, key))
        assert.equal(view[key], expected[key], `Current actor source ${key} must match.`);
      if (Object.hasOwn(view, 'currentStep')) assert.equal(view.currentStep, expected.currentStep);
      if (Object.hasOwn(view, 'range')) assert.equal(view.range, expected.currentStep);
    }
    if (!(await authority())) { if (resolvedSource) return sourceChanged(); await wait(); continue; }
    const painted = await inspectPaint(view); budget();
    if (!(await authority())) { if (resolvedSource) return sourceChanged(); await wait(); continue; }
    if (painted.status === 'eligible' || painted.status === 'blocked' || painted.status === 'source-excluded') {
      const sourceReason = wolfChoiceSourceReason(view);
      if (painted.status === 'eligible') assert.equal(sourceReason, undefined, 'Unavailable source cannot become an eligible painted choice.');
      else {
        assert.ok(sourceReason && painted.explicit === true, 'An eligible source cannot be recast as blocked without an explicit source blocker.');
        assert.equal(painted.reason, sourceReason, 'Painted blocker must match the current source reason.');
        if (painted.status === 'source-excluded') assert.ok(['not-your-choice', 'no-special-choice'].includes(sourceReason),
          'Only the source panel’s deliberate not-your-choice/no-special-choice omission may be excluded.');
      }
      const current = await inspectAttack(); budget();
      if (!(await authority())) { if (resolvedSource) return sourceChanged(); await wait(); continue; }
      if (!sameAttack(current, expected)) return { status: 'source-changed', expected, gameplayCredit: false };
      return { ...painted, expected, choice: view, gameplayCredit: false,
        ...(boardingActor ? { originalActor: boardingActor } : {}) };
    }
    assert.equal(painted.status, 'pending', 'Unknown readiness cannot silently pass.');
    if (now() - lastAttackReadAt >= 1_000) {
      const current = await inspectAttack(); budget(); lastAttackReadAt = now();
      if (!(await authority())) { if (resolvedSource) return sourceChanged(); await wait(); continue; }
      if (!sameAttack(current, expected)) return { status: 'source-changed', expected, gameplayCredit: false };
    }
    await wait();
  }
  budget();
}

const rangeLabel = value => ({ 'long-range': 'Long Range', 'medium-range': 'Medium Range', 'short-range': 'Short Range' }[value]);
const wingLabel = value => value === 'fighter-wing-alpha' ? 'Fighter Wing Alpha' : 'Fighter Wing Bravo';
const pending = reason => ({ status: 'pending', reason });

function sourcePanel(page, spec, view) {
  const range = rangeLabel(view.range ?? spec.range), label = wingLabel(spec.sourceId);
  const names = {
    'aegis-launch': 'AEGIS fighter wing launches', 'maliades-launch': 'Maliades launch control',
    warheads: 'Enriched warheads', 'command-and-control': 'Command and Control',
    'fighter-range': `${label} ${range} actions`,
    'escort-range': `${spec.sourceId === 'maliades' ? 'Maliades' : 'P.D.F. Escort Fighter Wing'} ${range} actions`,
    'range-support': `${{ highwall: 'Highwall Cannon', boa: 'Boa Scrap Strike', 'gorgoneion-missile-array': 'Gorgoneion Missile Array', 'vulcan-laser-cannon': 'Vulcan Laser Cannon' }[spec.sourceId]} ${range} choice`,
    'range-actions': view.choiceStatus === 'committed' ? 'Wolf range assignments'
      : view.type?.endsWith('-unavailable') ? 'AEGIS range weapons' : 'Wolf range actions',
    'commander-targeting': 'Targeting dice', 'force-field': 'Gorgoneion Force Field Projector',
    'boarding-special': 'Current boarding special choice',
    'boarding-defence': view.targetShipId ? `${view.targetShipId.replaceAll('-', ' ').toUpperCase()} boarding defence` : 'Boarding defence',
  };
  if (spec.kind === 'pdf-launch') return page.locator('[aria-label="PDF Escort Wing launch control"]');
  assert.ok(names[spec.kind], `Known source choice panel required: ${spec.kind}`);
  return page.getByRole('region', { name: names[spec.kind], exact: true });
}

function blockerPattern(spec, view, reason) {
  if (spec.kind.endsWith('launch')) {
    if (reason === 'passed') return /Launch choice passed for this attack/i;
    if (reason === 'unavailable') return /could not launch.*(?:current |this )?attack/i;
    if (reason === 'already-launched') return /(?:is launched for this attack|launched \/\/ Cycle|Launched for this attack)/i;
    return ({ uncharged: /(?:Charge Fighter Bay|Fighter Bay.*uncharged).*?(?:before launching|launch denied)/i,
      damaged: /(?:Fighter Bay.*(?:damaged|cannot launch)|is damaged)/i,
      destroyed: /destroyed.*(?:cannot launch|launch denied)/i, 'no-fighters': /No .*fighters remain/i })[reason];
  }
  if (spec.kind === 'warheads') return ({ enriched: /Five ore paid once/, passed: /Enriched warheads passed/,
    unavailable: /Unavailable \/\/ choose at attack start/ })[reason];
  if (spec.kind === 'command-and-control') return ({ passed: /Command and Control passed/,
    'already-used': /Command committed/, uncharged: /Unavailable \/\/ charge Command and Control/,
    damaged: /Unavailable \/\/ Command and Control is damaged/,
    'damage-unknown': /Unavailable \/\/ AEGIS damage status could not be verified/,
    'no-targets': /Unavailable \/\/ no Wolf ships/,
    'commander-pending': /Rerolls pending|Waiting for the assigned Wolf Commander/ })[reason];
  if (spec.kind === 'fighter-range' || spec.kind === 'escort-range') return ({
    committed: /This range is committed|range.*committed|Choice committed/i,
    'not-launched': /(?:wing|Maliades) did not launch for (?:the )?current attack|Launch Maliades before choosing range actions/i,
    destroyed: /Maliades is destroyed and cannot act/,
  })[reason];
  if (spec.kind === 'range-support') return ({ used: /action committed/, passed: /You passed this range action/,
    'not-current-holder': /Only the current assigned source holder/ })[reason];
  if (spec.kind === 'range-actions' && reason && reason !== 'waiting') return reason === 'committed'
    ? /This range decision is committed/ : /No weapon choice is open/;
  if (spec.kind === 'boarding-defence') return ({ 'no-boarders': /No surviving boarding parties/,
    'not-your-choice': /This ship’s defence choice is not open yet/, committed: /defence choice is locked/ })[reason];
  if (spec.kind === 'force-field') return ({ selected: /Force Field protects/, passed: /Captain recorded a pass/,
    'no-current-captain': /No current Gorgoneion Captain/,
    'ambiguous-current-captain': /Captain assignment is ambiguous/,
    'gorgoneion-not-admitted': /Gorgoneion is not admitted/,
    'projector-not-ready': /Force Field Projector charge is unavailable/,
    'captain-berth-unavailable': /Captain’s current host and fleet group cannot be verified/ })[reason];
  return undefined;
}

/** Read the real public labels; disabled/checking/absent controls remain pending. */
export async function inspectWolfChoicePaint(page, spec, view) {
  const reason = wolfChoiceSourceReason(view);
  if (spec.kind === 'boarding-special' && ['not-your-choice', 'no-special-choice'].includes(reason))
    return { status: 'source-excluded', reason, explicit: true };
  let panel = sourcePanel(page, spec, view);
  if (!(await panel.isVisible())) return pending('The actual current choice panel is not mounted.');
  const header = await panel.innerText();
  if (spec.kind === 'aegis-launch') {
    for (const prior of spec.settledLaunchChoices ?? []) {
      const article = panel.getByRole('article', { name: wingLabel(prior.sourceId), exact: true });
      const reason = prior.status === 'launched' ? 'already-launched' : prior.status;
      if (!blockerPattern(spec, view, reason)?.test(await article.innerText()))
        return pending('A prior committed wing choice has not painted on this same actor.');
    }
    panel = panel.getByRole('article', { name: wingLabel(spec.sourceId), exact: true });
  }
  const text = await panel.innerText();
  if (view.turn !== undefined && !['pdf-launch', 'maliades-launch'].includes(spec.kind) &&
      !new RegExp(`Cycle ${view.turn}(?:\\D|$)`, 'i').test(header)) return pending('The current cycle has not painted.');
  if (view.revision !== undefined && ['warheads', 'command-and-control', 'commander-targeting'].includes(spec.kind) &&
      !new RegExp(`Rev ${view.revision}(?:\\D|$)`).test(header)) return pending('The current revision has not painted.');
  const pattern = blockerPattern(spec, view, reason);
  if (pattern?.test(text)) return { status: 'blocked', reason, explicit: true };
  if (reason) return pending('The current source blocker has not painted.');
  // These two ordinary range notices describe recovery after a disconnect;
  // they do not say this currently live actor is disconnected. Keep every
  // other checking/reconnect notice, current source tuple and enabled-control
  // requirement intact.
  const readinessText = spec.kind === 'range-actions' ? text
    .replace('No automatic pass is applied at the deadline. Reconnect to make the current choice.', '')
    .replace('Choice committed to the server. Reconnecting will restore the current step.', '') : text;
  if (/Checking|Opening|Reconnect|Waiting for (?:a |the )?(?:live|fresh)|Could not refresh/.test(readinessText))
    return pending('The actual panel is still checking current authority.');
  const range = rangeLabel(view.range ?? spec.range);
  const buttons = {
    'aegis-launch': [`Pass ${wingLabel(spec.sourceId)}`], 'maliades-launch': ['Pass Maliades'],
    'pdf-launch': ['Pass PDF Escort Wing'], warheads: ['Pass enriched warheads'],
    'command-and-control': ['Pass Command and Control'], 'force-field': ['Pass Force Field'],
    'commander-targeting': ['Finish rerolls'], 'fighter-range': [`Pass ${range}`],
    'escort-range': [spec.sourceId === 'maliades' ? `Pass Maliades ${range}` : `Pass ${range}`],
    'range-support': ['Pass this range'], 'range-actions': ['Pass this range'],
    'boarding-special': [view.choice?.kind === 'commander' ? 'Do not lead'
      : view.choice?.kind === 'relocation' ? /^Stay at / : view.choice?.kind === 'reroll' ? 'Pass rerolls'
        : view.choice?.kind === 'militia' ? 'Commit Militia risk' : 'Record facilitator ruling'],
  };
  if (spec.kind === 'boarding-defence' || (spec.kind === 'range-actions' && view.choiceStatus === 'targets-required')) {
    const controls = panel.getByRole('combobox');
    if (await controls.count() && await controls.first().isEnabled())
      return { status: 'eligible', reason: 'Current source selection controls are enabled.' };
    // A valid zero-hit assignment may need no selectors.
    const commit = panel.getByRole('button', { name: spec.kind === 'boarding-defence' ? 'Commit defence' : 'Commit target assignments', exact: true });
    if (await commit.isVisible() && await commit.isEnabled()) return { status: 'eligible', reason: 'Current source commit is enabled.' };
  } else if (spec.kind === 'boarding-special' && view.choice?.kind === 'commander-ruling') {
    const ruling = panel.getByRole('textbox', { name: 'Facilitator ruling', exact: true });
    if (await ruling.isVisible() && await ruling.isEnabled()) return { status: 'eligible', reason: 'Current required facilitator ruling control is enabled.' };
  } else for (const name of buttons[spec.kind] ?? []) {
    const control = panel.getByRole('button', { name, ...(typeof name === 'string' ? { exact: true } : {}) });
    if (await control.isVisible() && await control.isEnabled()) return { status: 'eligible', reason: 'Current source choice control is enabled.' };
  }
  return pending('Current source choice controls have not become enabled.');
}

const endpoints = {
  'aegis-launch': 'getAegisFighterWingLaunch', 'maliades-launch': 'getDioneMaliadesLaunch',
  'pdf-launch': 'getPdfEscortWingLaunch', warheads: 'getAegisEnrichedWarheadChoice',
  'command-and-control': 'getAegisCommandAndControl', 'fighter-range': 'getWolfFighterRangeActionChoice',
  'escort-range': 'getWolfEscortRangeActionChoice', 'range-support': 'getWolfRangeSupportActionChoice',
  'range-actions': 'getWolfRangeActionChoice', 'force-field': 'getWolfForceFieldChoice',
  'commander-targeting': 'getWolfCommanderTargeting', 'boarding-special': 'getWolfBoardingSpecialChoice',
  'boarding-defence': 'getWolfBoardingDefenceChoice',
};

/** SDK supplements are read-only and labeled. A missing UI never causes a mutation supplement. */
export function createWolfChoiceWaiter(context, { tools, originalGm, deadlineAt = Infinity, record = tools.record } = {}) {
  const { gm, roster, initial } = context;
  return async function waitChoice(surface, current, spec, { deadlineAt: stageDeadline = deadlineAt } = {}) {
    const choiceDeadline = Math.min(Date.now() + 60_000, deadlineAt, stageDeadline);
    const original = await observeWolfChoiceActor(surface);
    if (surface !== gm) {
      assert.ok(roster.some(actor => actor.roleId === original.profileRoleId && actor.uidHash === original.uidHash),
        'Combat choices use the original ordinary named Auth account.');
      assert.equal(original.playerRole, 'player');
    }
    const expectedGm = originalGm ?? await gm.observe();
    assert.equal(expectedGm.playerRole, 'gm'); assert.equal(expectedGm.sessionId, initial.sessionId);
    if (context.started) {
      assert.equal(expectedGm.uidHash, context.started.uidHash); assert.equal(expectedGm.instanceId, context.started.instanceId);
    }
    const expected = { ...current, sessionId: initial.sessionId };
    if (spec.kind === 'aegis-launch') {
      const settledLaunchChoices = ['fighter-wing-alpha', 'fighter-wing-bravo'].flatMap(sourceId => {
        const choice = current.fighterLaunchChoices?.[sourceId];
        if (!choice) return [];
        assert.equal(choice.sourceId, sourceId); assert.equal(choice.attackId, current.attackId); assert.equal(choice.turn, current.turn);
        assert.ok(['launched', 'passed', 'unavailable'].includes(choice.status));
        assert.ok(Number.isSafeInteger(choice.revision) && choice.revision >= 1 && choice.revision <= current.revision);
        return [{ sourceId, status: choice.status }];
      });
      spec = { ...spec, settledLaunchChoices };
    }
    const endpoint = endpoints[spec.kind]; assert.ok(endpoint, 'Only a known read-only current actor source is allowed.');
    const fields = spec.kind === 'aegis-launch' ? { wingId: spec.sourceId }
      : ['fighter-range', 'escort-range', 'range-support'].includes(spec.kind) ? { range: spec.range, sourceId: spec.sourceId } : {};
    const readChoice = async () => {
      // The generic driver omits these GM lease/audience fields. Capture them
      // with the existing read-only proof observer before this actual read.
      // A surface without that evidence can still read, but cannot recover a denial.
      const inspectReadGm = endpoint === 'getWolfBoardingSpecialChoice' && typeof gm.storeModuleUrl === 'function'
        ? () => observeWolfChoiceActor(gm) : null;
      const readGm = inspectReadGm ? await inspectReadGm() : null;
      assert.ok(Date.now() < choiceDeadline, 'Current combat choice readiness deadline expired before its SDK read.');
      const reply = await surface.callable(endpoint, { sessionId: initial.sessionId, ...fields,
        ...(surface === gm && spec.kind === 'boarding-special' ? { instanceId: expectedGm.instanceId } : {}) });
      if (reply?.status !== 'committed') {
        const error = new Error(typeof reply?.message === 'string' ? reply.message
          : `Read-only ${endpoint} did not return a successful SDK reply.`, { cause: reply });
        error.code = reply?.code;
        const readDenial = { endpoint, reply };
        try {
          await record?.('current combat choice read denial', { cycle: current.turn, kind: spec.kind,
            roleId: original.profileRoleId, uidHash: original.uidHash, revision: current.revision,
            currentStep: current.currentStep, status: 'denied', readDenial,
            gameplayCredit: false, actionCredit: false, acceptanceCredit: false });
        } catch (failure) {
          throw new Error(`Combat SDK denial evidence could not be recorded: ${failure.message}`, { cause: error });
        }
        if (endpoint === 'getWolfBoardingSpecialChoice' && reply?.status === 'denied' &&
            reply.code === 'functions/failed-precondition' && typeof reply.message === 'string' && reply.message.trim())
          closedBoardingReadDenials.set(error, { readChoice, readDenial, originalGm: readGm, inspectGm: inspectReadGm });
        throw error;
      }
      return reply.result;
    };
    const inspectAttack = (options = {}) => {
      if (options.serverOnly !== true) return tools.read('gm', 'wolfAttackState/current');
      return tools.read('gm', 'wolfAttackState/current', { serverOnly: true, deadlineAt: choiceDeadline,
        onSnapshot: async outcome => {
          const observed = outcome?.status === 'ok' && outcome.value && typeof outcome.value === 'object' ? outcome.value : null;
          const integer = value => Number.isSafeInteger(value) ? value : null;
          const boolean = value => typeof value === 'boolean' ? value : null;
          // Only the tuple used by the strict assertion and snapshot freshness
          // cross into evidence. No IDs, targets, contacts or private choices.
          await record?.('current combat closed boarding source reinspection', {
            cycle: current.turn, kind: spec.kind, roleId: original.profileRoleId, uidHash: original.uidHash,
            revision: current.revision, currentStep: current.currentStep, diagnosticOnly: true,
            sourceReinspection: { readSource: 'server-only', readCount: 1,
              status: outcome?.status === 'ok' ? 'observed' : 'failed',
              code: typeof outcome?.code === 'string' && /^(?:firestore\/)?[a-z][a-z-]{0,63}$/.test(outcome.code) ? outcome.code : null,
              tuple: observed ? {
                sameSession: Object.hasOwn(observed, 'sessionId') ? observed.sessionId === expected.sessionId : null,
                sameAttack: observed.attackId === expected.attackId, turn: integer(observed.turn), revision: integer(observed.revision),
                status: ['idle', 'due', 'prepared', 'declared', 'resolved'].includes(observed.status) ? observed.status : null,
                currentStep: ['targeting', 'long-range', 'medium-range', 'short-range', 'boarding', 'resolved'].includes(observed.currentStep)
                  ? observed.currentStep : null,
                airspaceLocked: boolean(observed.airspaceLocked),
              } : null,
              metadata: { fromCache: boolean(outcome?.metadata?.fromCache), hasPendingWrites: boolean(outcome?.metadata?.hasPendingWrites) } },
            gameplayCredit: false, actionCredit: false, acceptanceCredit: false });
        } });
    };
    const result = await waitForWolfChoiceReadiness({ original, expected,
      originalGm: expectedGm, inspectGm: () => gm.observe(), inspectActor: () => observeWolfChoiceActor(surface),
      deadlineAt: choiceDeadline, requireBoardingDiscovery: spec.kind === 'boarding-defence',
      inspectAttack,
      readChoice, inspectPaint: view => inspectWolfChoicePaint(surface.page, spec, view) });
    await record?.('current combat choice readiness', { cycle: current.turn, kind: spec.kind,
      roleId: original.profileRoleId, uidHash: original.uidHash, revision: current.revision,
      currentStep: current.currentStep, status: result.status, reason: result.reason,
      ...(result.originalActor?.boardingDiscoveryAuthority
        ? { discoveryAuthority: result.originalActor.boardingDiscoveryAuthority } : {}),
      ...(result.readDenial ? { readDenial: result.readDenial, actionCredit: false, acceptanceCredit: false } : {}),
      gameplayCredit: false, transport: result.readDenial
        ? 'one denied original-browser SDK boarding read plus one original GM source reinspection; no choice paint or mutation'
        : 'one labeled original-browser SDK current actor read plus actual control paint; mutations remain UI',
      limits: result.readDenial ? 'Source progress only; the caller must independently verify the final attack. No action or acceptance credit.'
        : 'Panels without a printed revision use source-matched cycle/status/control paint; the captured UI CAS request is the final revision fence.' });
    return { ...result, originalActor: result.originalActor ?? original };
  };
}
