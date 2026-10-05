import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

function originalIdentity(current, original) {
  for (const key of ['sessionId', 'uidHash', 'profileRoleId', 'assignedRoleId', 'activeConsoleRoleId', 'playerRole', 'phase', 'cycle',
    'fleetGroupId', 'connectionGeneration', 'identityHydrationRevision', 'replacementRoleId', 'replacementStatus', 'seatId',
    'airspace', 'turnStatePhase', 'phaseProgression'])
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

/** Extra read-only fields bind the mounted controller's current audience/lease, without changing the generic driver. */
export async function observeWolfChoiceActor(surface) {
  const before = await surface.observe();
  const authority = await surface.page.evaluate(async moduleUrl => {
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
  async function authority() {
    budget();
    const actor = await inspectActor(); budget();
    // Check every identity, audience, lease and phase field before a private
    // source read. Only airspace may be the natural resolution consequence.
    originalIdentity({ ...actor, airspace: original.airspace }, original);
    const gm = inspectGm ? await inspectGm() : null;
    if (gm) { originalIdentity({ ...gm, airspace: originalGm.airspace }, originalGm); budget(); }
    if (!live(actor) || gm && !live(gm)) return false;
    const projections = [[actor, original], ...(gm ? [[gm, originalGm]] : [])];
    const changedAirspace = projections.filter(([current, bound]) => current.airspace !== bound.airspace);
    if (changedAirspace.length) {
      const current = await inspectAttack(); budget();
      if (gm && changedAirspace.every(([value, bound]) => bound.airspace === 'restricted' && value.airspace === 'lifted') &&
          typeof expected.sessionId === 'string' && expected.sessionId && expected.status !== 'resolved' &&
          original.sessionId === expected.sessionId && originalGm.sessionId === expected.sessionId &&
          // The real private document has no sessionId field: its original
          // authenticated GM reader uses this session's exact document path.
          current && (!Object.hasOwn(current, 'sessionId') || current.sessionId === expected.sessionId) &&
          current.attackId === expected.attackId &&
          current.turn === expected.turn && Number.isSafeInteger(current.revision) && current.revision > expected.revision &&
          current.status === 'resolved' && current.currentStep === 'resolved' && current.airspaceLocked === false) {
        const afterActor = await inspectActor(); budget();
        originalIdentity({ ...afterActor, airspace: original.airspace }, original);
        const afterGm = await inspectGm(); budget();
        originalIdentity({ ...afterGm, airspace: originalGm.airspace }, originalGm);
        if (!live(afterActor) || !live(afterGm)) return false;
        for (const [value, bound] of [[afterActor, original], [afterGm, originalGm]])
          if (value.airspace !== bound.airspace && !(bound.airspace === 'restricted' && value.airspace === 'lifted'))
            originalIdentity(value, bound);
        // This ends the obsolete choice inspection with zero gameplay credit.
        // The caller must independently read and verify the final attack.
        resolvedSource = current; return false;
      }
      // Any other airspace change retains the original hard assertion.
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
      view = await readChoice(); budget(); sourceRead = true;
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
    const result = await waitForWolfChoiceReadiness({ original, expected,
      originalGm: expectedGm, inspectGm: () => gm.observe(), inspectActor: () => observeWolfChoiceActor(surface),
      deadlineAt: choiceDeadline, requireBoardingDiscovery: spec.kind === 'boarding-defence',
      inspectAttack: () => tools.read('gm', 'wolfAttackState/current'),
      readChoice: async () => {
        const reply = await surface.callable(endpoint, { sessionId: initial.sessionId, ...fields,
          ...(surface === gm && spec.kind === 'boarding-special' ? { instanceId: expectedGm.instanceId } : {}) });
        assert.equal(reply.status, 'committed', `Read-only ${endpoint} must succeed before assessing this actor's control.`);
        return reply.result;
      }, inspectPaint: view => inspectWolfChoicePaint(surface.page, spec, view) });
    await record?.('current combat choice readiness', { cycle: current.turn, kind: spec.kind,
      roleId: original.profileRoleId, uidHash: original.uidHash, revision: current.revision,
      currentStep: current.currentStep, status: result.status, reason: result.reason,
      ...(result.originalActor?.boardingDiscoveryAuthority
        ? { discoveryAuthority: result.originalActor.boardingDiscoveryAuthority } : {}),
      gameplayCredit: false, transport: 'one labeled original-browser SDK current actor read plus actual control paint; mutations remain UI',
      limits: 'Panels without a printed revision use source-matched cycle/status/control paint; the captured UI CAS request is the final revision fence.' });
    return { ...result, originalActor: result.originalActor ?? original };
  };
}
