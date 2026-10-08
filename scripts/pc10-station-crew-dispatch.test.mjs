import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchStationCrewChoice, readStationWingChoiceAuthority } from './pc10-station-crew-dispatch.mjs';
import { runSparseStationCombat } from './pc10-station-combat-adapter.mjs';
import { observeUiReceipt } from './pc10-browser-ui-receipt.mjs';
import { heldProofFailureObservations } from './pc10-proof-failure-evidence.mjs';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { observeFullGameDemoPresentationMember } from './pc10-full-game-demo-proof-helpers.mjs';
import { dispatchStationWingChoice } from './pc10-fresh-minimum-ring-proof.mjs';

const sessionId = 'session-pc10';
const deadlineAt = Date.now() + 60_000;
const originalStationGmAuthority = Object.freeze({ sessionId, uidHash: 'uid-original-gm', generation: 4,
  hydrationRevision: 2, instanceId: 'gm-instance-original', claimedAt: 'lease-original' });

function attack(currentStep, revision = 8) {
  return { attackId: 'attack-p', threatSiteCode: 'P', turn: 3, revision,
    status: 'declared', currentStep, airspaceLocked: true, targetGroupId: 'fleet-p', threatSourceId: 'arrival-original-p' };
}

function stationPhaseEnvelope(actor, phaseRevision = actor.turnStatePhaseRevision, gmAuthority = originalStationGmAuthority) {
  return { sessionId, gmAuthority: { ...gmAuthority }, session: {
    phase: 'active', currentTurn: actor.turnStateCurrentTurn,
    turnLimit: actor.turnStateMaxTurn, fullGameDemo: { status: 'active', progression: 'manual' },
    turnPhase: { turn: actor.turnPhaseTurn, teamPhaseEndsAt: actor.turnPhaseTeamPhaseEndsAt,
      openAirspaceEndsAt: actor.turnPhaseOpenAirspaceEndsAt,
      airspace: { state: actor.airspace, tickerActive: true, pressAccess: false }, progression: actor.phaseProgression },
    turnState: { currentTurn: actor.turnStateCurrentTurn, maxTurn: actor.turnStateMaxTurn,
      phase: actor.turnStatePhase, phaseRevision, startedAt: actor.turnStateStartedAt, endsAt: actor.turnStateEndsAt },
  } };
}

function stationTeamPhaseEnvelope(actor, phaseRevision) {
  const team = { ...actor, airspace: 'restricted', turnStatePhase: 'team',
    turnStatePhaseRevision: phaseRevision, turnStateEndsAt: actor.turnPhaseTeamPhaseEndsAt };
  return stationPhaseEnvelope(team, phaseRevision);
}

function surface(roleId, response, { entitledShipId = 'icebreaker', path = '/ships/icebreaker/roles/icebreaker-miner',
  responses = {}, defenceOptions = ['0', '1', '2'], profileRoleId = roleId,
  ownerReturnHref = '/ships/icebreaker/roles/icebreaker-miner', onLinkWait } = {}) {
  const effects = { clicks: [], selected: [], reads: [], enabledChecks: [] };
  const selectedValues = new Map();
  const actor = { hasAuth: true, sameActor: true, uidHash: `uid-${roleId}`, sessionId,
    profileRoleId, assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId,
    playerRole: 'player', phase: 'active', cycle: 3, fleetGroupId: 'fleet-p', connectionGeneration: 1,
    identityHydrationRevision: 1, replacementRoleId: null, replacementStatus: null,
    airspace: 'restricted', turnStatePhase: 'team', turnStatePhaseRevision: 1,
    turnStateCurrentTurn: 3, turnStateMaxTurn: 6,
    turnStateStartedAt: '2026-10-08T00:10:00.000Z',
    turnStateEndsAt: '2026-10-08T00:10:00.000Z',
    openAirspaceEndsAt: '2026-10-08T00:30:00.000Z', teamPhaseEndsAt: '2026-10-08T00:10:00.000Z',
    turnPhaseTurn: 3, turnPhaseOpenAirspaceEndsAt: '2026-10-08T00:30:00.000Z',
    turnPhaseTeamPhaseEndsAt: '2026-10-08T00:10:00.000Z',
    phaseProgression: 'manual',
    connection: 'live', freshness: 'server' };
  const originalMember = structuredClone(actor);
  const authority = { sessionId, fleetGroupId: 'fleet-p', connectionGeneration: 1,
    identityHydrationRevision: 1, replacementRoleId: null, replacementStatus: null,
    seatId: roleId, connected: true,
    currentBerthShipId: entitledShipId,
    discoveryAuthority: { groupId: 'fleet-p', shipId: entitledShipId, revision: 2,
      fleetGroupVesselIds: [entitledShipId] } };
  const matches = (candidate, requested) => requested instanceof RegExp
    ? requested.test(candidate) : candidate === requested;
  const locator = (name, enabled = true, visible = true) => ({
    isVisible: async () => visible,
    isEnabled: async () => {
      const actual = typeof enabled === 'function' ? enabled() : enabled;
      effects.enabledChecks.push({ name, actual });
      return actual;
    },
    click: async () => { effects.clicks.push(name); },
    waitFor: async () => {},
    selectOption: async value => { effects.selected.push([name, value]); selectedValues.set(name, String(value)); },
    check: async () => { effects.selected.push([name, true]); },
    count: async () => 1,
    first() { return this; },
    nth() { return this; },
    all() { return Promise.resolve([this]); },
    locator: () => ({ evaluateAll: async inspect => inspect(defenceOptions.map(value => ({ value: String(value), disabled: false }))) }),
  });
  let currentRoute = path;
  let currentResponse = response;
  const panel = {
    isVisible: async () => currentRoute !== '/shuttles/highwall',
    innerText: async () => currentResponse?.reason === 'no-boarders'
      ? 'No surviving boarding parties are present on this ship. No Security Teams choice is required.'
      : `Cycle 3 // Rev ${currentResponse?.revision} // current source choice ${currentResponse?.choiceStatus==='unavailable'?'Unavailable // choose at attack start':currentResponse?.reason==='uncharged'?'Unavailable // charge Command and Control':currentResponse?.type?.endsWith('-unavailable')?'No weapon choice is open. The next step follows the server attack record.':currentResponse?.choiceStatus==='committed'?'This range decision is committed':currentResponse?.choiceStatus==='passed'?'Enriched warheads passed':''}`,
    getByRole: (kind, options = {}) => {
      if (kind === 'button') {
        const name = options.name;
        const known = typeof name === 'string' ? name : Object.keys(buttons).find(value => matches(value, name));
        return locator(known ?? String(name), buttons[known] !== false, buttons[known] !== undefined);
      }
      if (kind === 'combobox') {
        const name = options.name;
        const fighterLabels = (currentResponse?.fighters ?? []).flatMap(({ fighterIndex }) => [
          `Fighter ${fighterIndex + 1} action`, `Fighter ${fighterIndex + 1} target`,
        ]);
        const known = typeof name === 'string' ? name : fighterLabels.find(label => name?.test?.(label)) ?? String(name);
        const enabled = known.endsWith(' target')
          ? () => ['attack', 'target-shift'].includes(selectedValues.get(known.replace('target', 'action')))
          : true;
        return locator(known, enabled, true);
      }
      if (kind === 'checkbox') return locator(String(options.name), true, true);
      return locator(String(options.name), true, true);
    },
  };
  const buttons = Object.create(null);
  if ([response,...Object.values(responses)].some(view=>view?.type==='aegis-enriched-warhead-view')) buttons['Pass enriched warheads']=true;
  if ([response,...Object.values(responses)].some(view=>view?.type==='aegis-command-and-control-view')) buttons['Pass Command and Control']=true;
  if (response?.type==='wolf-range-action-choice-view') { buttons['Pass this range']=true;buttons['Use selected actions']=true;buttons['Commit target assignments']=true; }

  if (response?.type === 'pdf-escort-wing-launch-view') {
    buttons['Launch PDF Escort Wing'] = true;
    buttons['Pass PDF Escort Wing'] = true;
  }
  if (response?.sourceId === 'highwall') {
    buttons['Use Highwall Cannon'] = response.actionAvailable;
    buttons['Pass this range'] = true;
  }
  if (response?.wingId === 'pdf-escort-fighter-wing') {
    buttons['Pass Medium Range'] = true;
    buttons['Pass Short Range'] = true;
    buttons['Resolve Medium actions'] = true;
    buttons['Resolve selected Short attacks'] = true;
  }
  if (response?.choice?.kind === 'relocation') buttons['Stay at REFINERY 124'] = true;
  if ([response, ...Object.values(responses)].some(view => view?.type === 'wolf-boarding-defence-choice-view'))
    buttons['Commit defence'] = true;
  const page = {
    locator: () => ({ ...panel, isVisible: async () => currentRoute !== '/shuttles/highwall' }),
    getByRole: (kind, options = {}) => {
      if (kind === 'link') {
        const isVisible = async () => roleId === 'icebreaker-miner' &&
          (options.name === 'Open Highwall shuttle console' ? currentRoute !== '/shuttles/highwall'
            : options.name === 'Back to Icebreaker Miner console' && currentRoute === '/shuttles/highwall');
        return {
          isVisible,
          waitFor: async ({ state } = {}) => {
            if (state === 'visible' && !(await isVisible()))
              throw new Error(`Link ${String(options.name)} is not visible on ${currentRoute}.`);
            await onLinkWait?.(options.name, currentRoute);
          },
          getAttribute: async name => name === 'href'
            ? options.name === 'Back to Icebreaker Miner console' ? ownerReturnHref
              : options.name === 'Open Highwall shuttle console' ? '/shuttles/highwall' : null
            : null,
          click: async () => {
            if (!(await isVisible())) throw new Error(`Link ${String(options.name)} is not visible on ${currentRoute}.`);
            currentRoute = options.name === 'Open Highwall shuttle console'
              ? '/shuttles/highwall' : '/ships/icebreaker/roles/icebreaker-miner';
            effects.clicks.push(options.name);
            effects.routes.push(currentRoute);
          },
        };
      }
      if (kind === 'region' && /boarding/i.test(options.name ?? '')) return {
        ...panel,
        isVisible: async () => currentRoute !== '/shuttles/highwall',
      };
      if (kind === 'region' && /^Highwall Cannon /.test(options.name ?? '')) return {
        ...panel,
        isVisible: async () => currentRoute === '/shuttles/highwall',
      };
      return panel;
    },
    url: () => `https://new-eden.invalid/#${currentRoute}`,
    evaluate: async () => ({ ...actor, ...authority }),
  };
  effects.routes = [];
  return Object.assign({ label: roleId, page, route: () => currentRoute,
    originalMember,
    observe: async () => actor,
    storeModuleUrl: () => 'test://useSessionStore',
    testActor: actor,
    testAuthority: authority,
    callable: async (endpoint, payload) => {
      effects.reads.push({ endpoint, payload });
      currentResponse = responses[endpoint] ?? response;
      return { status: 'committed', result: currentResponse };
    },
  }, { effects });
}

function setLiftedCoordinationProjection(actor) {
  actor.testActor.airspace = 'lifted';
  actor.testActor.turnStatePhase = 'coordination';
  actor.testActor.turnStateEndsAt = actor.testActor.openAirspaceEndsAt;
}

function publishDeclaredAttackLock(actor, current) {
  actor.testActor.airspace = 'restricted';
  actor.testActor.turnStatePhase = 'team';
  actor.testActor.turnStatePhaseRevision++;
  actor.testActor.turnStateEndsAt = actor.testActor.teamPhaseEndsAt;
  return { ...current, airspaceLocked: true };
}

function options(actors, current, onAction, deadline = deadlineAt) {
  const actorChecks = [];
  return { actors, sessionId, deadlineAt: deadline, assertActor: async (actor, context) => {
    const observed = await actor.surface.observe();
    actorChecks.push({ roleId: actor.roleId, stage: context.stage, profileRoleId: observed.profileRoleId });
    assert.equal(actor.surface.label, actor.roleId);
    for (const key of ['uidHash', 'sessionId', 'playerRole', 'assignedRoleId', 'fleetGroupId'])
      assert.equal(observed[key], actor.surface.originalMember[key], `Original member ${key} must remain exact.`);
    assert.equal(observed.cycle, context.current.turn);
    assert.equal(observed.phase, 'active');
    return observed;
  }, readAttack: async () => current,
  gmAuthority: originalStationGmAuthority,
  readTurnState: async () => stationPhaseEnvelope(actors[0]?.surface?.testActor ?? {}),
  action: async (surface, endpoint, choose, metadata) => {
    await choose();
    onAction?.({ surface, endpoint, metadata });
    return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
  }, actorChecks };
}

test('dispatches the currently offered PDF launch through its colonel console and original deadline', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true }, { profileRoleId: null });
  let accepted;
  const opts = options([{ roleId: pdf.label, surface: pdf }], attack('targeting'), value => { accepted = value; });
  const result = await dispatchStationCrewChoice(attack('targeting'), opts);
  assert.deepEqual(result, { committed: true });
  assert.deepEqual(pdf.effects.reads.map(read => read.endpoint), ['getPdfEscortWingLaunch']);
  assert.deepEqual(pdf.effects.clicks, ['Launch PDF Escort Wing']);
  assert.equal(accepted.endpoint, 'launchPdfEscortWing');
  assert.equal(accepted.metadata.deadlineAt, deadlineAt);
  assert.equal(Object.hasOwn(accepted.metadata, 'original'), false,
    'Lifecycle capture receives the original deadline and actor fence, never an incompatible observer snapshot.');
  assert.ok(opts.actorChecks.length > 0 && opts.actorChecks.every(check => check.profileRoleId === null),
    'An assigned actor with null profileRoleId stays bound to its observed live identity.');
});

test('retains the consumed PDF source reply and exact stale panel text when readiness rejects it', async () => {
  // Source-backed synthetic shape: the server's PDF view projects a recorded
  // unavailable choice with reason=waiting; Attempt21 did not retain this
  // reply or a native PDF panel snapshot.
  const view = { type: 'pdf-escort-wing-launch-view', sessionId, turn: 3, revision: 8,
    wingRevision: 4, launched: false, eligible: false, choiceStatus: 'unavailable', reason: 'waiting' };
  const pdf = surface('refinery-124-pdf-colonel', view);
  const staleText = 'Waiting for an active Wolf Attack targeting window.';
  let panelReads = 0;
  pdf.page.locator = selector => {
    assert.equal(selector, '[aria-label="PDF Escort Wing launch control"]');
    return { isVisible: async () => true, innerText: async () => { panelReads++; return staleText; } };
  };
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current, undefined, Date.now() + 350);
  let failure;
  try { await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }
  assert.match(failure?.message ?? '', /readiness deadline expired/);
  const held = heldProofFailureObservations(failure).find(entry =>
    entry.operation === 'station-crew-current-source-readiness');
  assert.ok(held, 'The original readiness failure must retain its consumed observations.');
  assert.deepEqual(held.consumedObservations.sourceReplies, [{ endpoint: 'getPdfEscortWingLaunch',
    reply: { status: 'committed', result: view } }]);
  assert.ok(held.consumedObservations.paintObservations.length > 0);
  assert.deepEqual(held.consumedObservations.paintObservations.at(-1), { panelText: staleText,
    result: { status: 'pending', reason: 'The current source blocker has not painted.' } });
  assert.equal(panelReads, held.consumedObservations.paintObservations.length * 2,
    'The retained text comes from the painter’s existing reads; no diagnostic DOM reread is allowed.');
  assert.deepEqual(pdf.effects.clicks, []);
});

test('retains a committed PDF source reply before rejecting its foreign session', async () => {
  const reply = { status: 'committed', result: { type: 'pdf-escort-wing-launch-view',
    sessionId: 'foreign-session', turn: 3, revision: 8, wingRevision: 4,
    launched: false, eligible: false, choiceStatus: 'unavailable', reason: 'waiting' } };
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: false,
    choiceStatus: 'unavailable', reason: 'waiting' });
  pdf.callable = async (endpoint, payload, timeoutMs) => {
    pdf.effects.reads.push({ endpoint, payload, timeoutMs });
    return reply;
  };
  const current = attack('targeting');
  let failure;
  try { await dispatchStationCrewChoice(current, options([{ roleId: pdf.label, surface: pdf }], current)); }
  catch (error) { failure = error; }
  assert.match(failure?.message ?? '', /source session must match/);
  const held = heldProofFailureObservations(failure).find(entry =>
    entry.operation === 'station-crew-current-source-readiness');
  assert.ok(held);
  assert.deepEqual(held.consumedObservations.sourceReplies, [{ endpoint: 'getPdfEscortWingLaunch', reply }]);
  assert.deepEqual(held.consumedObservations.paintObservations, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('retains an exact denied boarding getter and its consumed attack-read bookends before failing closed', async () => {
  // Source-shaped synthetic callable reply. Attempt22 did not retain the
  // actual failed packet or denial-time transaction state, so this exercises
  // the dispatch consumer contract without claiming a native capture.
  const current = attack('boarding', 18);
  const sourceAttack = { ...current, type: 'wolf-attack-state', sessionId };
  const miner = surface('icebreaker-miner', { type: 'wolf-boarding-special-choice-view',
    sessionId, turn: 3, revision: 18,
    choice: { kind: 'relocation', craftId: 'chepu', currentHostId: 'refinery-124',
      fuelled: false, controlRevision: 2, legalHostIds: ['refinery-124'] } });
  const reply = { status: 'denied', code: 'functions/failed-precondition',
    message: 'Wolf boarding defence is not currently open.' };
  miner.callable = async (endpoint, payload, timeoutMs) => {
    miner.effects.reads.push({ endpoint, payload, timeoutMs });
    return reply;
  };
  let attackReads = 0, actions = 0;
  const opts = options([{ roleId: miner.label, surface: miner }], current);
  opts.readAttack = async () => { attackReads++; return structuredClone(sourceAttack); };
  opts.action = async () => { actions++; throw new Error('Denied source read must never reach an action.'); };

  let failure;
  try { await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }
  assert.equal(failure?.message, reply.message);
  const held = heldProofFailureObservations(failure).find(entry =>
    entry.operation === 'station-crew-current-source-readiness');
  assert.ok(held, 'The source-read rejection must retain the original readiness observations.');
  const sourceRead = held.consumedObservations.sourceReadAttempts?.find(entry =>
    entry.requestIntent?.endpoint === 'getWolfBoardingSpecialChoice');
  assert.ok(sourceRead, 'Retain the denial before later actor or attack validation can fail.');
  assert.deepEqual(sourceRead, {
    requestIntent: { endpoint: 'getWolfBoardingSpecialChoice', payload: { sessionId },
      source: 'dispatcher-built callable arguments' },
    transportPacketCaptured: false,
    beforeAttack: sourceAttack,
    afterAttack: sourceAttack,
    reply,
  });
  assert.equal(failure.code, reply.code, 'Keep the callable denial code without changing its classification.');
  assert.equal(failure.cause, reply, 'Keep the exact raw SDK reply as the original denial cause.');
  assert.ok(attackReads >= 5, 'The retained bookends are from the already consumed source-read path.');
  assert.equal(miner.effects.reads.length, 1, 'A denied read must not be retried.');
  assert.equal(actions, 0);
  assert.deepEqual(miner.effects.clicks, []);
});

test('uses the current PDF choice status before interpreting a stale waiting reason', async () => {
  // These exact reply/UI pairs are backend/component-derived source fixtures,
  // not native Attempt21 source or DOM captures.
  const waitingText = 'Waiting for an active Wolf Attack targeting window.';
  const cases = [
    { name: 'ordinary waiting', view: { eligible: false, launched: false, reason: 'waiting' },
      texts: [waitingText] },
    { name: 'passed', view: { eligible: false, launched: false, choiceStatus: 'passed', reason: 'passed' },
      texts: ['Launch choice passed for this attack.'] },
    { name: 'already launched', view: { eligible: false, launched: true, choiceStatus: 'launched', reason: 'already-launched' },
      texts: ['Launched // Cycle 3'] },
    { name: 'unavailable with stale waiting paint',
      view: { eligible: false, launched: false, choiceStatus: 'unavailable', reason: 'waiting' },
      texts: [waitingText, waitingText, waitingText, 'The Escort Wing could not launch for this attack.'] },
  ];

  for (const scenario of cases) {
    const view = { type: 'pdf-escort-wing-launch-view', sessionId, turn: 3, revision: 8,
      wingRevision: 4, ...scenario.view };
    const pdf = surface('refinery-124-pdf-colonel', view);
    let panelReads = 0;
    pdf.page.locator = selector => {
      assert.equal(selector, '[aria-label="PDF Escort Wing launch control"]');
      return { isVisible: async () => true,
        innerText: async () => scenario.texts[Math.min(panelReads++, scenario.texts.length - 1)] };
    };
    const current = attack('targeting');
    assert.equal(await dispatchStationCrewChoice(current,
      options([{ roleId: pdf.label, surface: pdf }], current)), undefined, scenario.name);
    assert.deepEqual(pdf.effects.clicks, [], `${scenario.name} cannot earn action credit.`);
    assert.equal(pdf.effects.reads.length, 1, `${scenario.name} stays on its single original source view.`);
    if (scenario.name === 'unavailable with stale waiting paint') assert.ok(panelReads >= 4);
  }
});

test('stops without a second actor choice when the attack tuple changes during the source read', async () => {
  let latest = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.callable = async (endpoint, payload, timeoutMs) => {
    pdf.effects.reads.push({ endpoint, payload, timeoutMs });
    latest = attack('targeting', 9);
    return { status: 'committed', result: { type: 'pdf-escort-wing-launch-view', sessionId,
      turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true } };
  };
  let actions = 0;
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.readAttack = async () => latest;
  opts.action = async () => { actions++; throw new Error('Changed source must stop before UI action.'); };
  assert.equal(await dispatchStationCrewChoice(current, opts), undefined);
  assert.equal(actions, 0);
  assert.ok(pdf.effects.reads[0].timeoutMs > 0 && pdf.effects.reads[0].timeoutMs <= 35_000);
});

test('does not dispatch if the authoritative attack lock drops after the strict scope snapshot', async () => {
  let latest = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.callable = async (endpoint, payload, timeoutMs) => {
    pdf.effects.reads.push({ endpoint, payload, timeoutMs });
    latest = { ...latest, airspaceLocked: false };
    return { status: 'committed', result: { type: 'pdf-escort-wing-launch-view', sessionId,
      turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true } };
  };
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.readAttack = async () => latest;
  let actions = 0;
  opts.action = async () => { actions++; throw new Error('Unlocked attack must stop before UI action.'); };
  assert.equal(await dispatchStationCrewChoice(current, opts), undefined);
  assert.equal(actions, 0);
  assert.deepEqual(pdf.effects.clicks, []);
});

// Source-shaped synthetic transitions: the PDF launch panel paints, then the
// already-used live reader sees a changed attack tuple. No native Attempt22
// attack-after-paint sample was retained.
const postPaintAttackChanges = [
  { name: 'declared lock drops', patch: { airspaceLocked: false } },
  { name: 'P site changes', patch: { threatSiteCode: 'Q' } },
];
for (const change of postPaintAttackChanges) {
  test(`stops after source paint when the exact P attack ${change.name}`, async () => {
    const current = attack('targeting');
    let latest = current, panelTextReads = 0, paintComplete = false, postPaintAttackReads = 0, actions = 0;
    const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
      sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
    const originalLocator = pdf.page.locator;
    pdf.page.locator = selector => {
      const panel = originalLocator(selector);
      return { ...panel, innerText: async () => {
        const text = await panel.innerText();
        panelTextReads++;
        if (panelTextReads === 2) {
          latest = { ...latest, ...change.patch };
          paintComplete = true;
        }
        return text;
      } };
    };
    const opts = options([{ roleId: pdf.label, surface: pdf }], current);
    opts.readAttack = async () => {
      if (paintComplete) postPaintAttackReads++;
      return latest;
    };
    opts.action = async (surface, endpoint, choose, metadata) => {
      actions++;
      await choose();
      return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
    };

    let result, failure;
    try { result = await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }
    assert.equal(failure, undefined,
      `${change.name} after paint should stop at readiness without entering the UI action; got ${failure?.message}.`);
    assert.equal(result, undefined, `${change.name} after paint grants no choice result.`);
    assert.equal(panelTextReads, 2, 'The source panel must actually paint before the exact attack changes.');
    assert.equal(postPaintAttackReads, 1,
      `${change.name} must be caught by the readiness bookend without a later dispatcher-stage read.`);
    assert.equal(actions, 0, `${change.name} after paint must be detected before lifecycle/action capture.`);
    assert.deepEqual(pdf.effects.clicks, []);
  });
}

test('returns no choice when the supplied attack has already changed before dispatcher entry', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.readAttack = async () => attack('targeting', 9);
  assert.equal(await dispatchStationCrewChoice(current, opts), undefined);
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('waits for the declared attack lock and restricted member view before freezing PDF action scope', async () => {
  const initial = { ...attack('targeting'), airspaceLocked: false };
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  let latest = { ...initial, airspaceLocked: false };
  setLiftedCoordinationProjection(pdf);
  let pageSamples = 0;
  pdf.page.evaluate = async () => {
    const observed = { ...pdf.testActor, ...pdf.testAuthority };
    pageSamples++;
    if (pageSamples === 1) latest = publishDeclaredAttackLock(pdf, latest);
    return observed;
  };
  const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
  opts.readAttack = async () => latest;
  opts.assertActor = async actor => { assert.equal(actor.surface.label, actor.roleId); return actor.surface.observe(); };
  const callable = pdf.callable;
  pdf.callable = async (...args) => {
    assert.equal(latest.airspaceLocked, true, 'No source view may be read before the server attack lock.');
    assert.equal(pdf.testActor.airspace, 'restricted', 'No source view may be read before the member projection is restricted.');
    assert.equal(pdf.testActor.turnStatePhase, 'team');
    assert.equal(pdf.testActor.turnStatePhaseRevision, 2,
      'The declaration must derive the Team phase revision from the captured Coordination revision.');
    assert.equal(pdf.testActor.turnStateCurrentTurn, 3);
    assert.equal(pdf.testActor.turnStateMaxTurn, 6);
    assert.equal(pdf.testActor.turnStateStartedAt, '2026-10-08T00:10:00.000Z');
    assert.equal(pdf.testActor.turnStateEndsAt, pdf.testActor.teamPhaseEndsAt);
    return callable(...args);
  };

  assert.deepEqual(await dispatchStationCrewChoice(initial, opts), { committed: true });
  assert.ok(pageSamples >= 3, 'The actor must be sampled again after the attack locks and once more by the strict observer.');
  assert.equal(pdf.effects.reads.length, 1);
  assert.equal(pdf.effects.clicks.at(-1), 'Launch PDF Escort Wing');
});

function installDelayedRestrictedProjection(actor, current) {
  const initial = { ...current, airspaceLocked: false };
  let latest = initial, sampleCount = 0;
  setLiftedCoordinationProjection(actor);
  actor.page.evaluate = async () => {
    const observed = { ...actor.testActor, ...actor.testAuthority };
    sampleCount++;
    if (sampleCount === 1) latest = publishDeclaredAttackLock(actor, latest);
    return observed;
  };
  const callable = actor.callable;
  actor.callable = async (...args) => {
    assert.equal(latest.airspaceLocked, true, 'The exact P attack must be authoritatively locked before any current choice read.');
    assert.equal(actor.testActor.airspace, 'restricted', 'The source read must wait for this member’s restricted projection.');
    assert.equal(actor.testActor.turnStatePhase, 'team');
    assert.equal(actor.testActor.turnStatePhaseRevision, 2,
      'The source-derived Coordination-to-Team phase revision must be exactly one higher.');
    assert.equal(actor.testActor.turnStateCurrentTurn, 3);
    assert.equal(actor.testActor.turnStateMaxTurn, 6);
    assert.equal(actor.testActor.turnStateStartedAt, '2026-10-08T00:10:00.000Z');
    assert.equal(actor.testActor.turnStateEndsAt, actor.testActor.teamPhaseEndsAt);
    return callable(...args);
  };
  return { initial, readAttack: async () => latest, sampleCount: () => sampleCount };
}

const delayedLockCases = [
  { name: 'PDF escort range', roleId: 'refinery-124-pdf-colonel', step: 'medium-range',
    view: { type: 'wolf-fighter-range-action-view', sessionId, attackId: 'attack-p', turn: 3, revision: 8,
      wingId: 'pdf-escort-fighter-wing', wingLabel: 'P.D.F. Escort Fighter Wing', range: 'medium-range',
      choiceStatus: 'pending', launched: true, fighters: [{ fighterIndex: 0 }],
      targets: [{ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 4 }] },
    endpoint: 'getWolfEscortRangeActionChoice' },
  { name: 'Miner Highwall range', roleId: 'icebreaker-miner', step: 'long-range', path: '/shuttles/highwall',
    view: { type: 'wolf-range-support-action-choice-view', sessionId, attackId: 'attack-p', turn: 3, revision: 8,
      sourceId: 'highwall', actorRoleId: 'icebreaker-miner', range: 'long-range', choiceStatus: 'pending',
      eligible: true, actionAvailable: false }, endpoint: 'getWolfRangeSupportActionChoice' },
  { name: 'boarding special', roleId: 'refinery-124-pdf-colonel', step: 'boarding',
    view: { type: 'wolf-boarding-special-choice-view', sessionId, turn: 3, revision: 8,
      choice: { kind: 'relocation', craftId: 'chepu', currentHostId: 'refinery-124', fuelled: false,
        controlRevision: 2, legalHostIds: ['refinery-124'] } }, endpoint: 'getWolfBoardingSpecialChoice',
    entitledShipId: 'refinery-124' },
  { name: 'boarding defence', roleId: 'icebreaker-miner', step: 'boarding',
    view: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
    responses: { getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-view', sessionId,
      turn: 3, revision: 8, targetShipId: 'icebreaker', boardingParties: 1,
      availableSecurityTeams: 2, choiceStatus: 'pending' } }, endpoint: 'getWolfBoardingSpecialChoice',
    secondaryEndpoint: 'getWolfBoardingDefenceChoice' },
];

for (const scenario of delayedLockCases) {
  test(`waits for the locked restricted projection before reading ${scenario.name}`, async () => {
    const actor = surface(scenario.roleId, scenario.view, { path: scenario.path,
      entitledShipId: scenario.entitledShipId, responses: scenario.responses });
    const current = attack(scenario.step);
    const delayed = installDelayedRestrictedProjection(actor, current);
    const opts = options([{ roleId: actor.label, surface: actor }], delayed.initial);
    opts.readAttack = delayed.readAttack;
    opts.assertActor = async supplied => {
      assert.equal(supplied.surface.label, supplied.roleId);
      const sample = await supplied.surface.observe();
      assert.equal(sample.uidHash, supplied.surface.testActor.uidHash);
      return sample;
    };

    const result = await dispatchStationCrewChoice(delayed.initial, opts);
    assert.ok(result === undefined || result.committed === true);
    assert.ok(actor.effects.reads.some(read => read.endpoint === scenario.endpoint));
    if (scenario.secondaryEndpoint)
      assert.ok(actor.effects.reads.some(read => read.endpoint === scenario.secondaryEndpoint));
    assert.ok(delayed.sampleCount() >= 3);
  });
}

test('keeps the original discovery epoch pinned during restricted-lock readiness and retains the failure evidence', async () => {
  const actor = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const current = attack('targeting');
  const delayed = installDelayedRestrictedProjection(actor, current);
  const originalEvaluate = actor.page.evaluate;
  let samples = 0;
  actor.page.evaluate = async (...args) => {
    samples++;
    if (samples === 2) actor.testAuthority.discoveryAuthority = { ...actor.testAuthority.discoveryAuthority,
      revision: actor.testAuthority.discoveryAuthority.revision + 1 };
    return originalEvaluate(...args);
  };
  const opts = options([{ roleId: actor.label, surface: actor }], delayed.initial);
  opts.readAttack = delayed.readAttack;
  opts.assertActor = async supplied => supplied.surface.observe();
  let failure;
  try { await dispatchStationCrewChoice(delayed.initial, opts); } catch (error) { failure = error; }
  assert.match(failure?.message ?? '', /discovery authority changed before choice scope freeze/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-lock-readiness');
  assert.equal(held.consumedObservations.actorScopes.length, 2);
  assert.equal(held.consumedObservations.actorScopes[0].discoveryAuthority.revision, 2);
  assert.equal(held.consumedObservations.actorScopes[1].discoveryAuthority.revision, 3);
  assert.deepEqual(actor.effects.reads, []);
  assert.deepEqual(actor.effects.clicks, []);
});

for (const changedField of ['attackId', 'revision']) {
  test(`stops with zero source or UI work when the current attack ${changedField} changes during lock readiness`, async () => {
    const initial = { ...attack('targeting'), airspaceLocked: false };
    const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
      sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
    let attackReads = 0, actions = 0;
    const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
    opts.readAttack = async () => {
      attackReads++;
      return attackReads === 1 ? initial : { ...initial,
        [changedField]: changedField === 'revision' ? initial.revision + 1 : 'replacement-attack' };
    };
    opts.action = async () => { actions++; throw new Error('A changed attack must not reach a UI action.'); };

    assert.equal(await dispatchStationCrewChoice(initial, opts), undefined);
    assert.ok(attackReads >= 2, 'The attack must change after dispatcher entry while the actor scope is being sampled.');
    assert.deepEqual(pdf.effects.reads, []);
    assert.deepEqual(pdf.effects.clicks, []);
    assert.equal(actions, 0);
  });
}

test('keeps the original deadline when the member remains lifted and retains timeout observations', async () => {
  const initial = { ...attack('targeting'), airspaceLocked: false };
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  setLiftedCoordinationProjection(pdf);
  const originalDeadlineAt = Date.now() + 120;
  const opts = { ...options([{ roleId: pdf.label, surface: pdf }], initial), deadlineAt: originalDeadlineAt,
    readAttack: async () => initial };
  let failure;
  try { await dispatchStationCrewChoice(initial, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /deadline expired/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-lock-readiness');
  assert.equal(held.deadlineAt, originalDeadlineAt);
  assert.deepEqual(held.originalAttack, { attackId: 'attack-p', threatSiteCode: 'P', turn: 3,
    revision: 8, status: 'declared', currentStep: 'targeting', airspaceLocked: false });
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

for (const changedField of ['connectionGeneration', 'identityHydrationRevision', 'uidHash']) {
  test(`rejects ${changedField} drift during lock readiness before reading or acting`, async () => {
    const initial = { ...attack('targeting'), airspaceLocked: false };
    const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
      sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
    let latest = initial, samples = 0;
    setLiftedCoordinationProjection(pdf);
    pdf.page.evaluate = async () => {
      samples++;
      if (samples === 1) {
        const observed = { ...pdf.testActor, ...pdf.testAuthority };
        latest = publishDeclaredAttackLock(pdf, latest);
        return observed;
      }
      if (samples === 2) {
        if (changedField === 'uidHash') pdf.testActor.uidHash = 'different-authenticated-actor';
        else {
          pdf.testActor[changedField]++;
          pdf.testAuthority[changedField]++;
        }
      }
      return { ...pdf.testActor, ...pdf.testAuthority };
    };
    const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
    opts.readAttack = async () => latest;
    let failure;
    try { await dispatchStationCrewChoice(initial, opts); } catch (error) { failure = error; }

    assert.match(failure?.message ?? '', new RegExp(`Original combat ${changedField} changed|Original Station actor ${changedField} changed|Original member ${changedField} must remain exact`));
    const [held] = heldProofFailureObservations(failure);
    assert.equal(held.operation, 'station-crew-lock-readiness');
    assert.ok(held.consumedObservations.actorScopes.length >= 1);
    assert.deepEqual(pdf.effects.reads, []);
    assert.deepEqual(pdf.effects.clicks, []);
  });
}

test('rejects a mixed restricted/coordination pair during lock readiness', async () => {
  const initial = { ...attack('targeting'), airspaceLocked: false };
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  let latest = initial, samples = 0;
  setLiftedCoordinationProjection(pdf);
  pdf.page.evaluate = async () => {
    samples++;
    if (samples === 1) {
      const observed = { ...pdf.testActor, ...pdf.testAuthority };
      pdf.testActor.airspace = 'restricted';
      latest = { ...latest, airspaceLocked: true };
      return observed;
    }
    return { ...pdf.testActor, ...pdf.testAuthority };
  };
  const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
  opts.readAttack = async () => latest;
  const authoritativeTeam = stationTeamPhaseEnvelope(pdf.testActor, 2);
  opts.readTurnState = async () => structuredClone(authoritativeTeam);
  let failure;
  try { await dispatchStationCrewChoice(initial, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /restricted\/coordination|turnStatePhase changed/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-lock-readiness');
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('rejects a member phaseRevision newer than the pinned authoritative Team phase', async () => {
  const initial = { ...attack('targeting'), airspaceLocked: false };
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  let latest = initial, samples = 0;
  setLiftedCoordinationProjection(pdf);
  pdf.page.evaluate = async () => {
    samples++;
    if (samples === 1) {
      const observed = { ...pdf.testActor, ...pdf.testAuthority };
      latest = publishDeclaredAttackLock(pdf, latest);
      pdf.testActor.turnStatePhaseRevision++;
      return observed;
    }
    return { ...pdf.testActor, ...pdf.testAuthority };
  };
  const opts = options([{ roleId: pdf.label, surface: pdf }], initial);
  opts.readAttack = async () => latest;
  const authoritativeTeam = stationTeamPhaseEnvelope(pdf.testActor, 2);
  opts.readTurnState = async () => structuredClone(authoritativeTeam);
  let failure;
  try { await dispatchStationCrewChoice(initial, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /phaseRevision|turnState phase revision|advance beyond the pinned current server phase/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-lock-readiness');
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('rejects restricted-to-lifted restoration after scope freeze inside the strict observer fence', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  const pinnedSource = structuredClone(stationPhaseEnvelope(pdf.testActor));
  let phaseReads = 0;
  opts.readTurnState = async () => {
    if (++phaseReads === 3) pdf.testActor.airspace = 'lifted';
    return structuredClone(pinnedSource);
  };
  let failure;
  try { await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /Original combat airspace changed/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-current-source-readiness');
  assert.equal(held.originalActor.airspace, 'restricted');
  assert.equal(held.consumedObservations.actorScopes.length, 6,
    'Failure evidence retains the canonical before/after samples plus normal-GM phase and post-freeze bookends.');
  assert.deepEqual(pdf.effects.reads, [], 'Strict post-freeze actor drift is rejected before private choice read.');
  assert.deepEqual(pdf.effects.clicks, []);
});

test('rejects a post-freeze turnStatePhase change inside the strict observer fence', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  const pinnedSource = structuredClone(stationPhaseEnvelope(pdf.testActor));
  let phaseReads = 0;
  opts.readTurnState = async () => {
    if (++phaseReads === 3) pdf.testActor.turnStatePhase = 'coordination';
    return structuredClone(pinnedSource);
  };
  let failure;
  try { await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }

  assert.match(failure?.message ?? '', /Original combat turnStatePhase changed/);
  const [held] = heldProofFailureObservations(failure);
  assert.equal(held.operation, 'station-crew-current-source-readiness');
  assert.equal(held.originalActor.turnStatePhase, 'team');
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('rejects original member generation drift during the last authoritative phase read before UI intent', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  const pinned = structuredClone(stationPhaseEnvelope(pdf.testActor));
  let inIntent = false, finalPhaseReads = 0;
  opts.readTurnState = async () => {
    if (inIntent && ++finalPhaseReads === 4) pdf.testActor.connectionGeneration++;
    return structuredClone(pinned);
  };
  opts.action = async (surface, endpoint, choose, metadata) => {
    inIntent = true;
    await choose();
    return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
  };

  await assert.rejects(dispatchStationCrewChoice(current, opts), /generation|Original combat/i);
  assert.equal(finalPhaseReads, 4, 'Drift is introduced during the last phase source await after prior actor samples.');
  assert.deepEqual(pdf.effects.clicks, [], 'A final phase read must be followed by current actor and attack checks before UI intent.');
});

test('does not treat a generic action wrapper status as a committed source receipt', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const current = attack('targeting');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.action = async (surface, endpoint, choose, metadata) => {
    await choose();
    return { endpoint, data: metadata.expectedRequest, status: 'committed' };
  };
  await assert.rejects(dispatchStationCrewChoice(current, opts),
    /Actual launchPdfEscortWing UI result did not carry a committed or replayed source receipt/);
});

test('dispatches the PDF medium-range choice from the current escort view', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'wolf-fighter-range-action-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, wingId: 'pdf-escort-fighter-wing',
    wingLabel: 'P.D.F. Escort Fighter Wing', range: 'medium-range', choiceStatus: 'pending', launched: true,
    fighters: [{ fighterIndex: 0 }], targets: [{ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 4 }] });
  let accepted;
  const opts = options([{ roleId: pdf.label, surface: pdf }], attack('medium-range'), value => { accepted = value; });
  const result = await dispatchStationCrewChoice(attack('medium-range'), opts);
  assert.deepEqual(result, { committed: true });
  assert.deepEqual(pdf.effects.reads.map(read => read.endpoint), ['getWolfEscortRangeActionChoice']);
  assert.ok(pdf.effects.selected.some(([, value]) => value === 'attack'));
  assert.ok(pdf.effects.selected.some(([, value]) => value === 'contact-1'));
  assert.equal(accepted.endpoint, 'commitWolfEscortRangeActionChoice');
  assert.equal(accepted.metadata.deadlineAt, deadlineAt);
  assert.deepEqual(accepted.metadata.expectedRequest.actions,
    [{ kind: 'attack', targetContactId: 'contact-1', fighterIndex: 0 }]);
});

test('preserves visible PDF Short fighters by an explicit current source pass', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'wolf-fighter-range-action-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, wingId: 'pdf-escort-fighter-wing',
    wingLabel: 'P.D.F. Escort Fighter Wing', range: 'short-range', choiceStatus: 'pending', launched: true,
    fighters: [{ fighterIndex: 0 }], targets: [{ instanceId: 'contact-1', label: 'Wolf contact 1', targetNumber: 4 }] });
  let accepted;
  const current = attack('short-range');
  const opts = options([{ roleId: pdf.label, surface: pdf }], current, value => { accepted = value; });
  const result = await dispatchStationCrewChoice(current, opts);
  assert.deepEqual(result, { committed: true });
  assert.equal(pdf.effects.selected.some(([name, value]) => String(name).includes('Short attack') && value === true),false);
  assert.deepEqual(pdf.effects.clicks,['Pass Short Range']);
  assert.equal(accepted.endpoint, 'commitWolfEscortRangeActionChoice');
  assert.deepEqual(accepted.metadata.expectedRequest.fighterIndexes, []);
});

test('opens the current Miner Highwall console and explicitly passes a long-range choice', async () => {
  const miner = surface('icebreaker-miner', { type: 'wolf-range-support-action-choice-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, sourceId: 'highwall',
    actorRoleId: 'icebreaker-miner', range: 'long-range', choiceStatus: 'pending', eligible: true,
    actionAvailable: false, deadlineAt: '9999-12-31T23:59:59.999Z', contacts: [] });
  let accepted;
  const opts = options([{ roleId: miner.label, surface: miner }], attack('long-range'), value => { accepted = value; });
  const result = await dispatchStationCrewChoice(attack('long-range'), opts);
  assert.deepEqual(result, { committed: true });
  assert.equal(miner.effects.clicks[0], 'Open Highwall shuttle console');
  assert.equal(miner.effects.clicks.at(-1), 'Pass this range');
  assert.equal(accepted.endpoint, 'commitWolfRangeSupportActionChoice');
  assert.equal(accepted.metadata.deadlineAt, deadlineAt);
});

test('returns from the real Highwall route to the printed Miner console before boarding reads', async () => {
  const miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall', responses: {
    getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
    getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
  } });
  const current = attack('boarding');
  const result = await dispatchStationCrewChoice(current, { ...options([{ roleId: miner.label, surface: miner }], current),
    deadlineAt: Date.now() + 400 });
  assert.equal(result, undefined);
  assert.equal(miner.effects.clicks[0], 'Back to Icebreaker Miner console');
  assert.equal(miner.route(), '/ships/icebreaker/roles/icebreaker-miner');
  assert.deepEqual(miner.effects.routes, ['/ships/icebreaker/roles/icebreaker-miner']);
  assert.deepEqual(miner.effects.reads.map(read => read.endpoint), [
    'getWolfBoardingSpecialChoice', 'getWolfBoardingDefenceChoice',
  ]);
});

test('returns from Highwall before directly offered Miner boarding defence', async () => {
  const miner = surface('icebreaker-miner', { type: 'wolf-range-support-action-choice-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, sourceId: 'highwall',
    actorRoleId: 'icebreaker-miner', range: 'long-range', choiceStatus: 'pending', eligible: true,
    actionAvailable: false, deadlineAt: '9999-12-31T23:59:59.999Z', contacts: [] }, { defenceOptions: ['0', '1'], responses: {
    getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
    getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-view', sessionId,
      turn: 3, revision: 8, choiceStatus: 'pending', targetShipId: 'icebreaker', availableSecurityTeams: 1 },
  } });
  const rangeAttack = attack('long-range');
  const rangeResult = await dispatchStationCrewChoice(rangeAttack,
    { ...options([{ roleId: miner.label, surface: miner }], rangeAttack), deadlineAt: Date.now() + 10_000 });
  assert.deepEqual(rangeResult, { committed: true });
  assert.deepEqual(miner.effects.clicks, ['Open Highwall shuttle console', 'Pass this range']);
  assert.equal(miner.route(), '/shuttles/highwall');

  const current = attack('boarding');
  let accepted;
  const result = await dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current,
    value => { accepted = value; }, Date.now() + 10_000));
  assert.deepEqual(result, { committed: true });
  assert.deepEqual(miner.effects.clicks, ['Open Highwall shuttle console', 'Pass this range',
    'Back to Icebreaker Miner console', 'Commit defence']);
  assert.equal(miner.route(), '/ships/icebreaker/roles/icebreaker-miner');
  assert.deepEqual(miner.effects.reads.map(read => read.endpoint), [
    'getWolfRangeSupportActionChoice', 'getWolfBoardingSpecialChoice', 'getWolfBoardingDefenceChoice',
  ]);
  assert.equal(accepted.endpoint, 'commitWolfBoardingDefenceChoice');
});

test('does not click a Miner return link when the owner destination is not the assigned console', async () => {
  const miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall',
    ownerReturnHref: '/ships/quellon/roles/quellon-engineer', responses: {
      getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
  const current = attack('boarding');
  await assert.rejects(dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current)),
    /printed Miner owner return link must target the assigned Miner console/);
  assert.deepEqual(miner.effects.clicks, []);
  assert.deepEqual(miner.effects.reads, []);
  assert.equal(miner.route(), '/shuttles/highwall');
});

test('does not follow a same-path Miner return href from a foreign origin', async () => {
  const miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall',
    ownerReturnHref: 'https://outside.invalid/ships/icebreaker/roles/icebreaker-miner', responses: {
      getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
  const current = attack('boarding');
  await assert.rejects(dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current)),
    /current console navigation link must stay on the original browser origin/);
  assert.deepEqual(miner.effects.clicks, [], 'A same-path cross-origin owner href must be rejected before click.');
  assert.equal(miner.route(), '/shuttles/highwall');
});

test('rejects Miner generation drift before the owner return click under the current-member fence', async () => {
  let miner;
  miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall',
    onLinkWait: async name => {
      if (name === 'Back to Icebreaker Miner console') {
        miner.testActor.connectionGeneration++;
        miner.testAuthority.connectionGeneration++;
      }
    }, responses: {
      getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
  const current = attack('boarding');
  await assert.rejects(dispatchStationCrewChoice(current,
    options([{ roleId: miner.label, surface: miner }], current)),
  /Original (?:combat connectionGeneration|Station actor connectionGeneration) changed/);
  assert.deepEqual(miner.effects.clicks, []);
  assert.equal(miner.route(), '/shuttles/highwall');
});

test('rejects P attack revision drift while the Miner owner return link is waiting', async () => {
  const current = attack('boarding');
  let liveAttack = current;
  const miner = surface('icebreaker-miner', null, { path: '/shuttles/highwall',
    onLinkWait: async name => {
      if (name === 'Back to Icebreaker Miner console') liveAttack = { ...current, revision: current.revision + 1 };
    }, responses: {
      getWolfBoardingSpecialChoice: { type: 'wolf-boarding-special-choice-unavailable', sessionId, reason: 'no-special-choice' },
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
  const opts = options([{ roleId: miner.label, surface: miner }], current);
  opts.readAttack = async () => liveAttack;
  await assert.rejects(dispatchStationCrewChoice(current, opts),
    /The original P attack or exact lock changed before final Station UI intent/);
  assert.deepEqual(miner.effects.clicks, []);
  assert.equal(miner.route(), '/shuttles/highwall');
});

test('Highwall entry is a no-op when already mounted and remains stable on repeated range dispatch', async () => {
  const miner = surface('icebreaker-miner', { type: 'wolf-range-support-action-choice-view',
    sessionId, attackId: 'attack-p', turn: 3, revision: 8, sourceId: 'highwall',
    actorRoleId: 'icebreaker-miner', range: 'long-range', choiceStatus: 'pending', eligible: true,
    actionAvailable: false, deadlineAt: '9999-12-31T23:59:59.999Z', contacts: [] }, { path: '/shuttles/highwall' });
  const current = attack('long-range');
  const first = await dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current));
  assert.deepEqual(first, { committed: true });
  assert.deepEqual(miner.effects.clicks, ['Pass this range']);
  const second = await dispatchStationCrewChoice(current, options([{ roleId: miner.label, surface: miner }], current));
  assert.deepEqual(second, { committed: true });
  assert.deepEqual(miner.effects.clicks, ['Pass this range', 'Pass this range']);
  assert.equal(miner.route(), '/shuttles/highwall');
  assert.deepEqual(miner.effects.routes, []);
});

test('continues across supplied boarding actors until the source offers a current crew special choice', async () => {
  const wing = surface('wing-commander', { type: 'wolf-boarding-special-choice-unavailable',
    sessionId, reason: 'no-special-choice' }, { entitledShipId: 'aegis', responses: {
      getWolfBoardingDefenceChoice: { type: 'wolf-boarding-defence-choice-unavailable', sessionId, reason: 'no-boarders' },
    } });
  const pdf = surface('refinery-124-pdf-colonel', { type: 'wolf-boarding-special-choice-view',
    sessionId, turn: 3, revision: 8, choice: { kind: 'relocation', craftId: 'chepu',
      currentHostId: 'refinery-124', fuelled: false, controlRevision: 2, legalHostIds: ['refinery-124'] } },
  { entitledShipId: 'refinery-124' });
  let accepted;
  const current = attack('boarding');
  const opts = options([{ roleId: wing.label, surface: wing }, { roleId: pdf.label, surface: pdf }], current,
    value => { accepted = value; });
  const result = await dispatchStationCrewChoice(current, opts);
  assert.deepEqual(result, { committed: true });
  assert.deepEqual(wing.effects.reads.map(read => read.endpoint), ['getWolfBoardingSpecialChoice', 'getWolfBoardingDefenceChoice']);
  assert.deepEqual(pdf.effects.reads.map(read => read.endpoint), ['getWolfBoardingSpecialChoice']);
  assert.deepEqual(pdf.effects.clicks, ['Stay at REFINERY 124']);
  assert.equal(accepted.endpoint, 'commitWolfBoardingSpecialChoice');
  assert.equal(accepted.metadata.deadlineAt, deadlineAt);
});

test('commits defence only for the current discovered ship and chooses within offered Security Team options', async () => {
  const defence = { type: 'wolf-boarding-defence-choice-view', sessionId, turn: 3, revision: 8,
    targetShipId: 'icebreaker', boardingParties: 2, availableSecurityTeams: 2,
    choiceStatus: 'pending', deadlineAt: '9999-12-31T23:59:59.999Z' };
  // One surface provides the same ordinary actor's two actual current views.
  const crew = surface('icebreaker-miner', { type: 'wolf-boarding-special-choice-unavailable',
    sessionId, reason: 'no-special-choice' }, { entitledShipId: 'icebreaker', responses: {
      getWolfBoardingDefenceChoice: defence,
    } });
  let accepted;
  const current = attack('boarding');
  const opts = options([{ roleId: crew.label, surface: crew }], current, value => { accepted = value; });
  const result = await dispatchStationCrewChoice(current, opts);
  assert.deepEqual(result, { committed: true });
  assert.equal(crew.effects.clicks.at(-1), 'Commit defence');
  assert.ok(crew.effects.selected.some(([, value]) => value === '2'));
  assert.equal(accepted.endpoint, 'commitWolfBoardingDefenceChoice');
  assert.deepEqual(accepted.metadata.expectedRequest, { sessionId, expectedTurn: 3,
    expectedRevision: 8, targetShipId: 'icebreaker', securityTeams: 2 });
});

test('does not select absent crew, the Press desk, or the existing Wing route for non-boarding steps', async () => {
  const press = surface('press-officer', { type: 'wolf-boarding-special-choice-unavailable', sessionId,
    reason: 'no-special-choice' });
  const result = await dispatchStationCrewChoice(attack('long-range'), options([
    { roleId: 'absent-pdf-colonel', surface: surface('absent-pdf-colonel', null) },
    { roleId: press.label, surface: press },
    { roleId: 'wing-commander', surface: surface('wing-commander', null) },
  ], attack('long-range')));
  assert.equal(result, undefined);
  assert.equal(press.effects.reads.length, 0);
});

test('unknown offered boarding special kinds fail with a specific error before any mutation', async () => {
  const crew = surface('refinery-124-pdf-colonel', { type: 'wolf-boarding-special-choice-view',
    sessionId, turn: 3, revision: 8, choice: { kind: 'unknown-source-choice' } },
  { entitledShipId: 'refinery-124' });
  const opts = options([{ roleId: crew.label, surface: crew }], attack('boarding'));
  await assert.rejects(dispatchStationCrewChoice(attack('boarding'), opts),
    /Unknown current boarding special choice kind: unknown-source-choice/);
  assert.deepEqual(crew.effects.clicks, []);
});

for (const stage of ['enabled-control wait', 'lifecycle capture wait']) {
  for (const changedField of ['turnStatePhase', 'turnStatePhaseRevision', 'attack revision']) {
    test(`rejects frozen ${changedField} drift during the ${stage} before PDF launch intent`, async () => {
      const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
        sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
      const current = attack('targeting');
      let latestAttack = current;
      let enabledAttackDrift = false, postEnableAttackReads = 0;
      const mutate = () => {
        if (changedField === 'turnStatePhase') pdf.testActor.turnStatePhase = 'coordination';
        else if (changedField === 'turnStatePhaseRevision') pdf.testActor.turnStatePhaseRevision++;
        else if (stage === 'enabled-control wait') enabledAttackDrift = true;
        else latestAttack = attack('targeting', current.revision + 1);
      };
      const opts = options([{ roleId: pdf.label, surface: pdf }], current);
      opts.readAttack = async () => {
        if (enabledAttackDrift) {
          postEnableAttackReads++;
          return postEnableAttackReads === 1 ? current : attack('targeting', current.revision + 1);
        }
        return latestAttack;
      };

      if (stage === 'enabled-control wait') {
        const originalLocator = pdf.page.locator;
        pdf.page.locator = (...args) => {
          const panel = originalLocator(...args), originalGetByRole = panel.getByRole;
          return { ...panel, getByRole: (kind, requested) => {
            const control = originalGetByRole(kind, requested);
            if (kind === 'button' && requested.name === 'Launch PDF Escort Wing')
              return { ...control, isEnabled: async () => { mutate(); return true; } };
            return control;
          } };
        };
      } else {
        opts.action = async (surface, endpoint, choose, metadata) => {
          mutate();
          await choose();
          return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
        };
      }

      let result, failure;
      try { result = await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }
      assert.ok(failure, `Expected stale UI intent rejection; received ${JSON.stringify(result)}.`);
      assert.match(failure.message, changedField === 'attack revision' ? /attack|source changed/i : /phase|turnState/);
      const [held] = heldProofFailureObservations(failure).filter(item => item.operation === 'station-crew-final-ui-intent');
      assert.ok(held, 'The original final-intent failure must retain its frozen scope and read trace.');
      assert.equal(held.deadlineAt, deadlineAt);
      assert.equal(held.originalAttack.attackId, current.attackId);
      assert.ok(held.consumedObservations.actorScopes.length > 0);
      if (stage === 'enabled-control wait' && changedField === 'attack revision')
        assert.equal(postEnableAttackReads, 2, 'The frozen attack must be rechecked inside the final UI-intent callback.');
      assert.deepEqual(pdf.effects.clicks, [], 'Stale UI intent must be rejected before a browser click.');
    });
  }
}

test('rechecks the exact P attack after the final actor sample before PDF launch intent', async () => {
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  const current = attack('targeting');
  let insideAction = false, finalAttackRead = false, latestAttack = current;
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.readAttack = async () => {
    if (insideAction && !finalAttackRead) {
      finalAttackRead = true;
      return current;
    }
    return latestAttack;
  };
  const originalEvaluate = pdf.page.evaluate;
  pdf.page.evaluate = async (...args) => {
    const sample = await originalEvaluate(...args);
    if (insideAction && finalAttackRead) latestAttack = attack('targeting', current.revision + 1);
    return sample;
  };
  opts.action = async (surface, endpoint, choose, metadata) => {
    insideAction = true;
    await choose();
    return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
  };

  let result, failure;
  try { result = await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }
  assert.ok(failure, `Expected post-sample attack drift rejection; received ${JSON.stringify(result)}.`);
  assert.match(failure.message, /attack|source changed/i);
  const [held] = heldProofFailureObservations(failure).filter(item => item.operation === 'station-crew-final-ui-intent');
  assert.ok(held, 'The final-intent failure must retain the original source evidence.');
  assert.equal(held.observedAttack.revision, current.revision + 1);
  assert.deepEqual(pdf.effects.clicks, [], 'The old source action must not click after the attack changes during actor sampling.');
});

test('waits for the pinned normal GM Team projection before freezing and acting on a stale actor', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.testActor.turnStatePhaseRevision = 11;
  let phaseReads = 0, phaseAtIntent = null;
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.gmAuthority = originalStationGmAuthority;
  opts.readTurnState = async () => {
    phaseReads++;
    if (phaseReads === 2) pdf.testActor.turnStatePhaseRevision = 13;
    return stationPhaseEnvelope(pdf.testActor, 13);
  };
  opts.action = async (surface, endpoint, choose, metadata) => {
    phaseAtIntent = pdf.testActor.turnStatePhaseRevision;
    await choose();
    return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
  };

  assert.deepEqual(await dispatchStationCrewChoice(current, opts), { committed: true });
  assert.equal(phaseAtIntent, 13, 'No choice may be intended from the retained Team11 member projection.');
  assert.ok(phaseReads >= 3, 'The original session phase must be read and bookended around the actor freeze.');
  assert.deepEqual(pdf.effects.clicks, ['Launch PDF Escort Wing']);
});

test('rejects a changed authoritative phase tuple before actor scope freeze', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.testActor.turnStatePhaseRevision = 13;
  let phaseReads = 0;
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.gmAuthority = originalStationGmAuthority;
  opts.readTurnState = async () => stationPhaseEnvelope(pdf.testActor, ++phaseReads === 1 ? 13 : 15);

  await assert.rejects(dispatchStationCrewChoice(current, opts), /phase|turnState|authoritative/i);
  assert.ok(phaseReads >= 2, 'The source change must be observed after the original phase tuple was pinned.');
  assert.deepEqual(pdf.effects.reads, [], 'A changed source phase must stop before the private choice read.');
  assert.deepEqual(pdf.effects.clicks, []);
});

test('retains timestamped normal-GM phase read windows before rejecting source drift', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.testActor.turnStatePhaseRevision = 13;
  let reads = 0;
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.gmAuthority = originalStationGmAuthority;
  opts.readTurnState = async () => stationPhaseEnvelope(pdf.testActor, ++reads === 1 ? 13 : 15);

  let failure;
  try { await dispatchStationCrewChoice(current, opts); } catch (error) { failure = error; }
  assert.match(failure?.message ?? '', /phase|turnState|authoritative/i);
  const held = heldProofFailureObservations(failure).find(item => item.operation === 'station-crew-lock-readiness');
  const phaseReads = held?.consumedObservations?.phaseReads ?? [];
  assert.ok(phaseReads.length >= 2, 'Retain the pinned and changed normal-GM source reads that caused the stop.');
  for (const read of phaseReads) {
    assert.equal(read.channel, 'original-GM-browser-Firestore-SDK');
    assert.ok(Number.isFinite(Date.parse(read.startedAt)) && Number.isFinite(Date.parse(read.completedAt)));
    assert.ok(Date.parse(read.completedAt) >= Date.parse(read.startedAt));
    assert.ok(Number.isFinite(read.deadlineAt));
    assert.ok(read.snapshot?.session?.turnState, 'Retain each exact consumed source projection with its read window.');
  }
  assert.equal(phaseReads.at(-1).snapshot.session.turnState.phaseRevision, 15);
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('rejects authoritative phase drift after actor scope freeze before UI intent', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.testActor.turnStatePhaseRevision = 13;
  let phaseReads = 0, phaseRevision = 13;
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.gmAuthority = originalStationGmAuthority;
  opts.readTurnState = async () => {
    phaseReads++;
    return stationPhaseEnvelope(pdf.testActor, phaseRevision);
  };
  opts.action = async (surface, endpoint, choose, metadata) => {
    phaseRevision = 15;
    await choose();
    return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
  };

  await assert.rejects(dispatchStationCrewChoice(current, opts), /phase|turnState|authoritative/i);
  assert.ok(phaseReads >= 2, 'The frozen source phase must be reread immediately before UI intent.');
  assert.deepEqual(pdf.effects.clicks, []);
});

test('rejects changed original GM lease identity while reading phase authority', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.testActor.turnStatePhaseRevision = 13;
  const changedLease = { ...originalStationGmAuthority, claimedAt: 'lease-replaced' };
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.gmAuthority = originalStationGmAuthority;
  opts.readTurnState = async () => stationPhaseEnvelope(pdf.testActor, 13, changedLease);

  await assert.rejects(dispatchStationCrewChoice(current, opts), /GM|lease|authority|claimedAt/i);
  assert.deepEqual(pdf.effects.reads, []);
  assert.deepEqual(pdf.effects.clicks, []);
});

test('does not extend the original deadline while reading the GM phase source', async () => {
  const current = attack('targeting');
  const pdf = surface('refinery-124-pdf-colonel', { type: 'pdf-escort-wing-launch-view',
    sessionId, turn: 3, revision: 8, wingRevision: 4, launched: false, eligible: true });
  pdf.testActor.turnStatePhaseRevision = 13;
  const opts = options([{ roleId: pdf.label, surface: pdf }], current, undefined, Date.now() + 300);
  opts.gmAuthority = originalStationGmAuthority;
  opts.readTurnState = async () => {
    await new Promise(resolve => setTimeout(resolve, 400));
    return stationPhaseEnvelope(pdf.testActor, 13);
  };

  await assert.rejects(dispatchStationCrewChoice(current, opts), /deadline|expired/i);
  assert.deepEqual(pdf.effects.reads, [], 'A phase read completing after the original budget cannot earn source readiness.');
  assert.deepEqual(pdf.effects.clicks, []);
});


// Source-shaped consumer regressions after Attempt25. These drive the real
// dispatcher/finite combat loop; they do not retroactively prove native finalization.
function stationFinalizationScenario(stage, { denial, drift, progressPatch = {} } = {}) {
  const current = { ...attack('boarding', 17), targetGroupId: 'fleet-p',
    threatSourceId: 'arrival-original-p' };
  const defence = { type: 'wolf-boarding-defence-choice-view', sessionId, turn: 3,
    revision: 17, targetShipId: 'icebreaker', boardingParties: 2,
    availableSecurityTeams: 2, choiceStatus: 'pending', deadlineAt: '9999-12-31T23:59:59.999Z' };
  const crew = surface('icebreaker-miner', { type: 'wolf-boarding-special-choice-unavailable',
    sessionId, reason: 'no-special-choice' }, { responses: { getWolfBoardingDefenceChoice: defence } });
  let latest = current, triggered = false, insideAction = false, actions = 0, canceledCallbacks = 0;
  const finalize = () => {
    if (triggered) return;
    triggered = true;
    latest = { ...current, revision: current.revision + 3, status: 'resolved',
      currentStep: 'resolved', airspaceLocked: false, pStationRepeat: { status: 'repeat' }, ...progressPatch };
    Object.assign(crew.testActor, { airspace: 'lifted', turnStatePhase: 'coordination',
      turnStatePhaseRevision: crew.testActor.turnStatePhaseRevision + 1,
      turnStateStartedAt: crew.testActor.turnPhaseTeamPhaseEndsAt,
      turnStateEndsAt: crew.testActor.turnPhaseOpenAirspaceEndsAt });
    drift?.(crew);
  };
  const opts = options([{ roleId: crew.label, surface: crew }], current);
  opts.readAttack = async () => structuredClone(latest);
  opts.readTurnState = async () => {
    if (stage === 'pre-freeze phase' || stage === 'final-intent phase' && insideAction) finalize();
    const phase = stationPhaseEnvelope(crew.testActor);
    if (triggered && stage === 'GM lease drift') phase.gmAuthority.instanceId = 'foreign-lease';
    return phase;
  };
  const evaluate = crew.page.evaluate;
  crew.page.evaluate = async (...args) => {
    if (stage === 'pre-freeze actor' && !triggered || stage === 'final-intent actor' && insideAction) finalize();
    return evaluate(...args);
  };
  const callable = crew.callable;
  crew.callable = async (...args) => {
    const reply = await callable(...args);
    if (['source getter', 'closed getter', 'denied getter', 'GM lease drift'].includes(stage)) {
      finalize();
      return denial ?? reply;
    }
    return reply;
  };
  const getByRole = crew.page.getByRole;
  crew.page.getByRole = (...args) => {
    const panel = getByRole(...args);
    if (stage === 'paint' && args[0] === 'region') return { ...panel,
      innerText: async () => { const text = await panel.innerText(); finalize(); return text; } };
    return panel;
  };
  opts.action = async (_surface, endpoint, choose, metadata) => {
    actions++; insideAction = true;
    let rejectObserver;
    try {
      await observeUiReceipt({
        waitForResponse: () => new Promise((_, reject) => { rejectObserver = reject; }),
        choose: async () => { await choose(); throw new Error('A stale choice unexpectedly clicked.'); },
      });
    } catch (error) {
      canceledCallbacks++;
      throw error;
    } finally {
      rejectObserver?.(new Error('Abandoned response wait is handled after zero-click cancellation.'));
    }
    throw new Error(`Canceled ${endpoint} cannot manufacture ${JSON.stringify(metadata.expectedRequest)}.`);
  };
  return { current, crew, opts, finalize, readAttack: opts.readAttack,
    latest: () => latest, counts: () => ({ triggered, actions, canceledCallbacks }) };
}

for (const stage of ['pre-freeze phase', 'pre-freeze actor', 'source getter', 'closed getter',
  'paint', 'final-intent phase', 'final-intent actor']) {
  test(`Station finalization during ${stage} cancels stale choice and lets actual loop read completion`, async () => {
    const scenario = stationFinalizationScenario(stage, { denial: stage === 'closed getter'
      ? { status: 'denied', code: 'functions/failed-precondition',
        message: 'Wolf boarding defence is not currently open.' } : undefined });
    const limit = Date.now() + 2000;
    scenario.opts.deadlineAt = limit;
    const choices = [];
    const final = await runSparseStationCombat({ deadlineAt: limit, readAttack: scenario.readAttack,
      assertActors: async () => {}, wait: async () => {}, choose: async current => {
        const result = await dispatchStationCrewChoice(current, scenario.opts);
        choices.push(result);
        return result;
      } });
    assert.equal(scenario.counts().triggered, true, 'The actual consumer must reach the transition seam.');
    assert.deepEqual(choices, [undefined], 'Cancellation grants no action/receipt credit.');
    assert.deepEqual(final, scenario.latest(), 'Completion comes only from the outer fresh attack read.');
    assert.equal(final.revision, 20, 'A legitimate transition is not restricted to +1 or +2.');
    assert.deepEqual(scenario.crew.effects.clicks, [], 'No stale irreversible UI intent is allowed.');
    if (stage.startsWith('final-intent')) assert.deepEqual(scenario.counts(),
      { triggered: true, actions: 1, canceledCallbacks: 1 }, 'The original capture callback cancels without waiting for a nonexistent response.');
  });
}

for (const denial of [
  { status: 'denied', code: 'functions/permission-denied', message: 'not entitled' },
  { status: 'denied', code: 'functions/unavailable', message: 'transport unavailable' },
  { status: 'denied', code: 'functions/failed-precondition', message: 'unknown boarding denial' },
]) {
  test(`Station source progress never masks ${denial.code}: ${denial.message}`, async () => {
    const scenario = stationFinalizationScenario('denied getter', { denial });
    await assert.rejects(dispatchStationCrewChoice(scenario.current, scenario.opts),
      error => error.message === denial.message && error.code === denial.code);
    assert.equal(scenario.counts().triggered, true);
    assert.deepEqual(scenario.crew.effects.clicks, []);
  });
}

for (const [name, drift] of [
  ['UID', crew => { crew.testActor.uidHash = 'foreign'; }],
  ['session', crew => { crew.testActor.sessionId = 'foreign'; }],
  ['generation', crew => { crew.testActor.connectionGeneration++; }],
  ['hydration', crew => { crew.testActor.identityHydrationRevision++; }],
  ['role', crew => { crew.testActor.assignedRoleId = 'foreign-role'; }],
  ['seat', crew => { crew.testActor.seatId = 'foreign-seat'; }],
  ['discovery', crew => { crew.testAuthority.discoveryAuthority.revision++; }],
  ['document', crew => { crew.testActor.documentTimeOrigin = 12345; }],
]) {
  test(`Station ${name} drift remains fatal with simultaneous finalized source progress`, async () => {
    const scenario = stationFinalizationScenario('source getter', { drift });
    await assert.rejects(dispatchStationCrewChoice(scenario.current, scenario.opts));
    assert.equal(scenario.counts().triggered, true);
    assert.deepEqual(scenario.crew.effects.clicks, []);
  });
}

test('Station original GM lease drift remains fatal with simultaneous finalized source progress', async () => {
  const scenario = stationFinalizationScenario('GM lease drift');
  await assert.rejects(dispatchStationCrewChoice(scenario.current, scenario.opts), /lease|instanceId/);
  assert.deepEqual(scenario.crew.effects.clicks, []);
});

for (const patch of [{ attackId: 'foreign' }, { turn: 4 }, { threatSiteCode: 'Q' },
  { targetGroupId: 'fleet-foreign' }, { threatSourceId: 'arrival-foreign' }, { revision: 16 },
  { airspaceLocked: true }, { currentStep: 'boarding' }, { pStationRepeat: { status: 'fabricated' } }]) {
  test(`Station invalid finalized progress stays fatal: ${JSON.stringify(patch)}`, async () => {
    const scenario = stationFinalizationScenario('pre-freeze phase', { progressPatch: patch });
    await assert.rejects(dispatchStationCrewChoice(scenario.current, scenario.opts));
    assert.deepEqual(scenario.crew.effects.clicks, []);
  });
}

test('Station Coordination alone remains fatal when the original declared attack has not progressed', async () => {
  const scenario = stationFinalizationScenario('unchanged');
  scenario.opts.readTurnState = async () => {
    const value = stationPhaseEnvelope(scenario.crew.testActor);
    value.session.turnPhase.airspace.state = 'lifted';
    value.session.turnState.phase = 'coordination';
    value.session.turnState.phaseRevision++;
    value.session.turnState.startedAt = value.session.turnPhase.teamPhaseEndsAt;
    value.session.turnState.endsAt = value.session.turnPhase.openAirspaceEndsAt;
    return value;
  };
  await assert.rejects(dispatchStationCrewChoice(scenario.current, scenario.opts), /Team|phase/);
  assert.deepEqual(scenario.crew.effects.clicks, []);
});


test('Station committed UI receipt remains credited across normal post-click finalization', async () => {
  const scenario = stationFinalizationScenario('post-click');
  let captures = 0;
  scenario.opts.action = async (_surface, endpoint, choose, metadata) => {
    await choose();
    captures++;
    scenario.finalize();
    return { endpoint, data: metadata.expectedRequest, httpStatus: 200,
      result: { status: 'committed', revision: 18 } };
  };
  assert.deepEqual(await dispatchStationCrewChoice(scenario.current, scenario.opts), { committed: true });
  assert.equal(captures, 1);
  assert.deepEqual(scenario.crew.effects.clicks, ['Commit defence']);
});

for (const [name, mutate] of [
  ['session identity', value => { value.sessionId = 'foreign'; }],
  ['cycle', value => { value.session.currentTurn++; }],
  ['manual mode', value => { value.session.fullGameDemo.progression = 'automatic'; }],
  ['failure outcome', value => { value.session.phase = 'failure'; }],
]) {
  test(`Station GM ${name} remains fatal with simultaneous finalization`, async () => {
    const scenario = stationFinalizationScenario('pre-freeze phase');
    const read = scenario.opts.readTurnState;
    scenario.opts.readTurnState = async (...args) => { const value = await read(...args); mutate(value); return value; };
    await assert.rejects(dispatchStationCrewChoice(scenario.current, scenario.opts));
    assert.deepEqual(scenario.crew.effects.clicks, []);
  });
}

test('Station foreign committed getter payload remains fatal with simultaneous finalization', async () => {
  const scenario = stationFinalizationScenario('source getter', { denial: { status: 'committed',
    result: { type: 'wolf-boarding-special-choice-unavailable', sessionId: 'foreign', reason: 'no-special-choice' } } });
  await assert.rejects(dispatchStationCrewChoice(scenario.current, scenario.opts), /source session/);
  assert.deepEqual(scenario.crew.effects.clicks, []);
});

test('Station ordered range progress during final capture cancels with zero stale clicks', async () => {
  const current = { ...attack('medium-range', 8), targetGroupId: 'fleet-p', threatSourceId: 'arrival-original-p' };
  let latest = current, insideAction = false;
  const pdf = surface('refinery-124-pdf-colonel', { type: 'wolf-fighter-range-action-view', sessionId,
    turn: 3, revision: 8, wingId: 'pdf-escort-fighter-wing', wingLabel: 'P.D.F. Escort Fighter Wing',
    range: 'medium-range', choiceStatus: 'pending', fighters: [{ fighterIndex: 0 }],
    targets: [{ instanceId: 'wolf-contact' }] }, { entitledShipId: 'refinery-124' });
  const opts = options([{ roleId: pdf.label, surface: pdf }], current);
  opts.readAttack = async () => latest;
  opts.readTurnState = async () => {
    if (insideAction) latest = { ...current, revision: 11, currentStep: 'short-range' };
    return stationPhaseEnvelope(pdf.testActor);
  };
  opts.action = async (_surface, endpoint, choose, metadata) => {
    insideAction = true;
    await choose();
    throw new Error(`A canceled ${endpoint} cannot manufacture a receipt for ${JSON.stringify(metadata.expectedRequest)}.`);
  };
  assert.equal(await dispatchStationCrewChoice(current, opts), undefined);
  assert.deepEqual(pdf.effects.clicks, []);
});

for (const field of ['targetGroupId', 'threatSourceId']) {
  test(`Station exact-revision ${field} drift is fatal inside the final capture callback`, async () => {
    const current = attack('targeting'), pdf = surface('refinery-124-pdf-colonel', {
      type: 'pdf-escort-wing-launch-view', sessionId, turn: 3, revision: 8, wingRevision: 4,
      launched: false, eligible: true });
    const opts = options([{ roleId: pdf.label, surface: pdf }], current);
    let inside = false;
    opts.readAttack = async () => inside ? { ...current, [field]: 'foreign' } : current;
    opts.action = async (_surface, endpoint, choose, metadata) => {
      inside = true; await choose();
      return { endpoint, data: metadata.expectedRequest, httpStatus: 200, result: { status: 'committed' } };
    };
    await assert.rejects(dispatchStationCrewChoice(current, opts));
    assert.deepEqual(pdf.effects.clicks, []);
  });
}

for (const discoveryDrift of [false, true]) {
  test(`Station ordered progress during a getter ${discoveryDrift ? 'cannot mask discovery drift' : 'retains complete cancellation bookends'}`, async () => {
    const current = attack('medium-range'), pdf = surface('refinery-124-pdf-colonel', {
      type: 'wolf-fighter-range-action-view', sessionId, turn: 3, revision: 8,
      wingId: 'pdf-escort-fighter-wing', wingLabel: 'P.D.F. Escort Fighter Wing',
      range: 'medium-range', choiceStatus: 'pending', fighters: [{ fighterIndex: 0 }],
      targets: [{ instanceId: 'wolf-contact' }] }, { entitledShipId: 'refinery-124' });
    const opts = options([{ roleId: pdf.label, surface: pdf }], current), observations = [];
    let latest = current;
    opts.readAttack = async () => latest;
    opts.onSourceProgress = async observation => observations.push(observation);
    const read = pdf.callable;
    pdf.callable = async (...args) => {
      const reply = await read(...args);
      latest = { ...current, revision: 11, currentStep: 'short-range' };
      if (discoveryDrift) pdf.testAuthority.discoveryAuthority.revision++;
      return reply;
    };
    if (discoveryDrift) {
      await assert.rejects(dispatchStationCrewChoice(current, opts));
      assert.deepEqual(observations, []);
    } else {
      assert.equal(await dispatchStationCrewChoice(current, opts), undefined);
      assert.equal(observations.length, 1);
      assert.equal(observations[0].observedAttack.revision, 11);
      assert.ok(observations[0].consumedObservations.actorScopes.length > 0);
    }
    assert.deepEqual(pdf.effects.clicks, []);
  });
}


test('Station benign cancellation retains its consumed phase and fresh source bookend without action credit', async () => {
  const scenario = stationFinalizationScenario('pre-freeze phase');
  const transitions = [];
  scenario.opts.onSourceProgress = async observation => transitions.push(observation);
  assert.equal(await dispatchStationCrewChoice(scenario.current, scenario.opts), undefined);
  assert.equal(transitions.length, 1);
  assert.equal(transitions[0].originalAttack.revision, 17);
  assert.equal(transitions[0].observedAttack.revision, 20);
  assert.equal(transitions[0].actionCredit, false);
  assert.equal(transitions[0].deadlineAt, scenario.opts.deadlineAt);
  assert.ok(transitions[0].consumedObservations.phaseReads.length > 0);
  assert.equal(transitions[0].consumedObservations.phaseReads.at(-1).snapshot.session.turnState.phase, 'coordination');
  assert.deepEqual(scenario.crew.effects.clicks, []);
});


test('Station exact closed boarding denial stays fatal after newer same-step declared progress', async () => {
  const current = attack('boarding', 17);
  const crew = surface('icebreaker-miner', { type: 'wolf-boarding-special-choice-unavailable',
    sessionId, reason: 'no-special-choice' });
  let latest = current;
  const opts = options([{ roleId: crew.label, surface: crew }], current);
  opts.readAttack = async () => latest;
  crew.callable = async () => {
    latest = { ...current, revision: 18 };
    return { status: 'denied', code: 'functions/failed-precondition',
      message: 'Wolf boarding defence is not currently open.' };
  };
  await assert.rejects(dispatchStationCrewChoice(current, opts), /Wolf boarding defence is not currently open/);
  assert.deepEqual(crew.effects.clicks, []);
});

for (const [name, drift] of [
  ['phase revision beyond source', crew => { crew.testActor.turnStatePhaseRevision += 4; }],
  ['stale Team start', crew => { crew.testActor.turnStateStartedAt = '2026-10-07T00:00:00.000Z'; }],
]) {
  test(`Station ${name} cannot qualify restoration with simultaneous finalization`, async () => {
    const scenario = stationFinalizationScenario('source getter', { drift });
    // Pin the GM envelope to the actual server restoration, independent of
    // the deliberately malformed member projection.
    const sourceActor = structuredClone(scenario.crew.testActor);
    Object.assign(sourceActor, { airspace: 'lifted', turnStatePhase: 'coordination',
      turnStatePhaseRevision: sourceActor.turnStatePhaseRevision + 1,
      turnStateStartedAt: sourceActor.turnPhaseTeamPhaseEndsAt,
      turnStateEndsAt: sourceActor.turnPhaseOpenAirspaceEndsAt });
    const read = scenario.opts.readTurnState;
    scenario.opts.readTurnState = async (...args) => {
      const value = await read(...args);
      return scenario.counts().triggered ? stationPhaseEnvelope(sourceActor) : value;
    };
    await assert.rejects(dispatchStationCrewChoice(scenario.current, scenario.opts));
    assert.deepEqual(scenario.crew.effects.clicks, []);
  });
}

test('Station crew requalifies terminal progress occurring during its ordered-stage actor bookend', async () => {
 const current=attack('medium-range'), crew=surface('refinery-124-pdf-colonel', {
  type:'wolf-fighter-range-action-view',sessionId,turn:3,revision:8,wingId:'pdf-escort-fighter-wing',
  wingLabel:'P.D.F. Escort Fighter Wing',range:'medium-range',choiceStatus:'pending',
  fighters:[{fighterIndex:0}],targets:[{instanceId:'wolf-contact'}]}, {entitledShipId:'refinery-124'});
 const opts=options([{roleId:crew.label,surface:crew}],current), observations=[];
 let latest=current, progressed=false, progressedPhaseRead=false;
 opts.readAttack=async()=>structuredClone(latest);
 opts.onSourceProgress=async row=>observations.push(row);
 opts.readTurnState=async()=>{if(progressed)progressedPhaseRead=true;return stationPhaseEnvelope(crew.testActor);};
 const read=crew.callable;
 crew.callable=async(...args)=>{const reply=await read(...args);progressed=true;
  latest={...current,revision:11,currentStep:'short-range'};return reply;};
 const evaluate=crew.page.evaluate;
 crew.page.evaluate=async(...args)=>{
  if(progressedPhaseRead&&latest.status==='declared'){
   latest={...latest,revision:15,status:'resolved',currentStep:'resolved',airspaceLocked:false,pStationRepeat:{status:'repeat'}};
   Object.assign(crew.testActor,{airspace:'lifted',turnStatePhase:'coordination',
    turnStatePhaseRevision:crew.testActor.turnStatePhaseRevision+1,
    turnStateStartedAt:crew.testActor.turnPhaseTeamPhaseEndsAt,turnStateEndsAt:crew.testActor.turnPhaseOpenAirspaceEndsAt});
  }
  return evaluate(...args);
 };
 assert.equal(await dispatchStationCrewChoice(current,opts),undefined);
 assert.deepEqual(crew.effects.clicks,[]);assert.equal(observations.length,1);
 assert.equal(observations[0].observedAttack.status,'resolved');
});

// Attempt26 retained Colonel fullMember epoch: generation2/hydration2, null
// ordinary profile, active Cycle2 owned PDF seat. Its failed summary packet
// was NOT retained. This executes the actual summary and browser observer
// producers over controlled Auth/store modules; the surrounding state, UID,
// mounted controls and mutation response are local source-shaped fixtures.
const observerRunnerSource = await readFile(new URL('./pc10-fresh-minimum-ring-proof.mjs', import.meta.url), 'utf8');
const normalObserveStart = observerRunnerSource.indexOf('    async function observe() {');
const normalObserveEnd = observerRunnerSource.indexOf('    async function until(', normalObserveStart);
assert.ok(normalObserveStart > 0 && normalObserveEnd > normalObserveStart);
const actualSummaryProducer = new Function('page', 'storeUrl',
  `${observerRunnerSource.slice(normalObserveStart, normalObserveEnd)} return observe;`);

async function runtimeObserverFixture(roleId = 'refinery-124-pdf-colonel', suppliedView) {
  const uid = `controlled-original-${roleId}`, sid = 'attempt26-observer-source';
  const shipId = ['wing-commander','executive-officer'].includes(roleId) ? 'aegis' : 'refinery-124';
  const member = { uid, sessionId: sid, role: 'player', connected: true, connectionGeneration: 2,
    assignedRoleId: roleId, activeConsoleRoleId: roleId, seatId: roleId, fleetGroupId: 'fleet-1',
    replacementRoleId: null, replacementStatus: null };
  const state = { me: member, connection: 'live', sessionSnapshotFreshness: 'server',
    identityHydrationRevision: 2, pendingCommands: [], seats: [{ id: roleId, roleId,
      status: 'claimed', holderUid: uid }], gmInstance: null,
    session: { id: sid, currentTurn: 2, phase: 'active', fullGameDemo: { status: 'active', progression: 'manual' },
      memberSessionScope: { groupId: 'fleet-1', vesselIds: [shipId], craftIds: [] },
      currentActorBerthAuthority: { sessionId: sid, actorUid: uid, groupId: 'fleet-1', role: 'player',
        connectionGeneration: 2, assignedRoleId: roleId, activeConsoleRoleId: roleId,
        replacementRoleId: null, replacementStatus: null, shipId },
      playerDiscovery: { groupId: 'fleet-1', shipId, revision: 4, fleetGroupVesselIds: [shipId] },
      turnPhase: { turn: 2, teamPhaseEndsAt: '9999-12-31T23:59:59.999Z', openAirspaceEndsAt: '9999-12-31T23:59:59.999Z',
        airspace: { state: 'restricted', tickerActive: true, pressAccess: false }, progression: 'manual' },
      turnState: { currentTurn: 2, maxTurn: 8, phase: 'team', phaseRevision: 5,
        startedAt: '2026-10-08T20:16:10.138Z', endsAt: '9999-12-31T23:59:59.999Z' } } };
  const authUser = { uid }, sdkAuthority = { hasServerSessionAuthority: true, resumePending: false };
  const counts = { summary: 0, member: 0, atomic: 0, shared: 0, capture: 0, phase: 0 };
  const hooks = {}, browserPerformance = { timeOrigin: 1791490623008.6 };
  const deps = { firebase: { auth: () => ({ currentUser: authUser }) },
    profile: { activeDemoActorProfile: null }, store: { useSessionStore: { getState: () => state } },
    authority: { sessionSnapshotAuthorityFor: () => sdkAuthority,
      memberSessionResumeBlocksFreshness: value => value.resumePending },
    crypto: { subtle: { digest: async (...args) => { const value = await webcrypto.subtle.digest(...args);
      await hooks.digest?.(); return value; } } }, performance: browserPerformance,
    document: { querySelector: () => null, querySelectorAll: () => [] } };
  const current = { attackId: 'attempt26-original', turn: 2, revision: 1, threatSiteCode: 'P',
    status: 'declared', currentStep: 'targeting', airspaceLocked: true,
    targetGroupId: 'fleet-1', threatSourceId: 'arrival-original-p' };
  let latest = current;
  const response = suppliedView ? {...suppliedView,sessionId:sid,turn:2,revision:1} : { type: 'pdf-escort-wing-launch-view', sessionId: sid, turn: 2, revision: 1,
    wingRevision: 1, launched: false, eligible: true };
  const actorSurface = surface(roleId, response, { profileRoleId: null, entitledShipId: shipId,
    path: `/ships/${shipId}/roles/${roleId}`, ...(suppliedView?{defenceOptions:(response.contacts??[]).map(row=>row.contactId)}:{}) });
  actorSurface.storeModuleUrl = () => 'http://127.0.0.1/src/state/useSessionStore.ts';
  actorSurface.sessionAuthorityModuleUrl = () => 'http://127.0.0.1/src/lib/sessionSnapshotAuthority.ts';
  actorSurface.page.evaluate = async (callback, args) => {
    let code = callback.toString();
    const kind = code.includes('naturalTransmissionMounted') ? 'summary' : code.includes('sdkResumePending') ? 'member'
      : code.includes('turnPhaseOpenAirspaceEndsAt') ? 'atomic' : 'shared';
    counts[kind]++; await hooks[kind]?.(counts[kind]);
    code = code.replaceAll("await import('/src/lib/firebase.ts')", 'deps.firebase')
      .replaceAll("await import('/src/lib/demoActorContext.ts')", 'deps.profile')
      .replaceAll('await import(moduleUrl)', 'deps.store')
      .replaceAll('await import(authorityModuleUrl)', 'deps.authority');
    assert.doesNotMatch(code, /await import\(/, 'Inject only actual browser module dependencies.');
    const value = await new Function('deps', 'args', `const {crypto,performance,document}=deps; return (${code})(args);`)(deps, args);
    await hooks.produced?.(kind, value, counts[kind]);
    return value;
  };
  actorSurface.observe = actualSummaryProducer(actorSurface.page, actorSurface.storeModuleUrl());
  const readMember = () => observeFullGameDemoPresentationMember(actorSurface, { knownRoleIds: [roleId] });
  const original = structuredClone(await readMember());
  const assertMember = async () => {
    const value = await readMember();
    assert.deepEqual(value.invalidFields, [], 'Actual mounted member fields must be well formed.');
    for (const key of ['hasAuth', 'sameActor', 'currentOwnPlayerConfirmed', 'memberScopeMatches',
      'currentCanonicalSeatOwned', 'currentMemberBerthPresent', 'currentMemberBerthMatches', 'sdkHasServerAuthority'])
      assert.equal(value[key], true, `Actual mounted member ${key} is required.`);
    assert.equal(value.sdkResumePending, false);
    for (const key of ['uidHash', 'sessionId', 'meSessionId', 'profileRoleId', 'profileSessionId', 'playerRole',
      'assignedRoleId', 'activeConsoleRoleId', 'seatId', 'fleetGroupId', 'replacementRoleId', 'replacementStatus',
      'connectionGeneration', 'identityHydrationRevision', 'documentTimeOrigin', 'cycle', 'phase'])
      assert.deepEqual(value[key], original[key], `Actual original member ${key} changed.`);
    assert.equal(value.connection, 'live');assert.equal(value.freshness, 'server');
    return value;
  };
  const readPhase = async () => { counts.phase++;await hooks.phase?.(counts.phase);
    return { sessionId: sid, gmAuthority: { ...originalStationGmAuthority, sessionId: sid },
      session: { phase: state.session.phase, currentTurn: state.session.currentTurn, turnLimit: 8,
        fullGameDemo: structuredClone(state.session.fullGameDemo), turnPhase: structuredClone(state.session.turnPhase),
        turnState: structuredClone(state.session.turnState) } }; };
  const action = async (_surface, endpoint, choose, metadata) => {
    counts.capture++;await hooks.capture?.();await choose();
    return { endpoint, httpStatus: 200, data: metadata?.expectedRequest ?? { wingId: 'fighter-wing-alpha' },
      result: { status: 'committed', launched: true } };
  };
  const opts = { actors: [{ roleId, surface: actorSurface }], sessionId: sid, deadlineAt: Date.now() + 2000,
    assertActor: assertMember, readAttack: async () => structuredClone(latest), readTurnState: readPhase,
    gmAuthority: { ...originalStationGmAuthority, sessionId: sid }, action };
  const finalize = () => {
    latest = { ...current, revision: 4, status: 'resolved', currentStep: 'resolved', airspaceLocked: false,
      pStationRepeat: { status: 'repeat' } };
    state.session.turnPhase.airspace.state = 'lifted';
    Object.assign(state.session.turnState, { phase: 'coordination', phaseRevision: 6,
      startedAt: state.session.turnPhase.teamPhaseEndsAt, endsAt: state.session.turnPhase.openAirspaceEndsAt });
  };
  return { current, state, authUser, sdkAuthority, browserPerformance, deps, counts, hooks, original,
    actorSurface, opts, readMember, assertMember, readPhase, action, finalize, response,
    invoke: () => dispatchStationCrewChoice(current, opts) };
}

test('Attempt26 actual summary producer feeds mounted PDF getter and normal launch capture without invented security fields', async () => {
 const f=await runtimeObserverFixture(), summary=await f.actorSurface.observe();
 assert.equal(summary.hydrationRevision,2);
 for(const key of ['identityHydrationRevision','seatId','replacementRoleId','replacementStatus','discoveryAuthority'])
  assert.equal(Object.hasOwn(summary,key),false,`Actual summary intentionally lacks ${key}.`);
 assert.deepEqual(await f.invoke(),{committed:true});
 assert.equal(f.counts.capture,1);assert.deepEqual(f.actorSurface.effects.clicks,['Launch PDF Escort Wing']);
 assert.equal(f.actorSurface.effects.reads[0].endpoint,'getPdfEscortWingLaunch');
});

test('Attempt26 default Wing observer composes actual fullMember and atomic producers inside normal capture', async () => {
 const f=await runtimeObserverFixture('wing-commander');
 f.actorSurface.page.getByRole=(_kind,{name})=>({isVisible:async()=>name==='Launch Fighter Wing Alpha',
  isEnabled:async()=>true,click:async()=>f.actorSurface.effects.clicks.push(name)});
 assert.deepEqual(await dispatchStationWingChoice(f.current,{deadlineAt:f.opts.deadlineAt,
  recipient:f.actorSurface,fullMember:f.assertMember,evidence:{stationWingOriginal:f.original},
  recoveredLaunches:new Map(),directory:'/tmp/unused-observer-fixture',readAttack:f.opts.readAttack,
  readTurnState:f.readPhase,gmAuthority:f.opts.gmAuthority,action:f.action}),{committed:true});
 assert.equal(f.counts.capture,1);assert.ok(f.counts.atomic>=3);assert.deepEqual(f.actorSurface.effects.clicks,['Launch Fighter Wing Alpha']);
});

// These controls mutate the actual producers' input after the original member
// has been frozen. Every late boundary must be reached before rejection can
// count as that boundary's proof; an earlier summary-shape failure is RED.
function mutateRuntimeObserverAt(f, seam, mutate) {
 let reached=false;
 const trigger=()=>{if(!reached){reached=true;mutate(f);}};
 if(seam==='canonical freeze') f.hooks.atomic=count=>{if(count===3)trigger();};
 else if(seam==='source getter'){
  const read=f.actorSurface.callable;
  f.actorSurface.callable=async(...args)=>{const reply=await read(...args);trigger();return reply;};
 }else if(seam==='source painter'){
  const locate=f.actorSurface.page.locator;
  f.actorSurface.page.locator=(...args)=>{const panel=locate(...args),text=panel.innerText;
   return {...panel,innerText:async()=>{const value=await text();trigger();return value;}};};
 }else if(seam==='final choose')f.hooks.capture=trigger;
 else assert.fail(`Unknown actual observer seam ${seam}.`);
 return ()=>reached;
}

for(const seam of ['canonical freeze','source getter','source painter','final choose']){
 test(`Attempt26 actual PDF canonical adapter rejects hydration drift at ${seam}`,async()=>{
  const f=await runtimeObserverFixture(),reached=mutateRuntimeObserverAt(f,seam,
   value=>{value.state.identityHydrationRevision++;});
  await assert.rejects(f.invoke(),/identityHydrationRevision/);
  assert.equal(reached(),true,`The ${seam} consumer must actually run.`);
  assert.deepEqual(f.actorSurface.effects.clicks,[]);
 });
}

for(const [name,mutate,reason] of [
 ['missing hydration',f=>{delete f.state.identityHydrationRevision;},/identityHydrationRevision/],
 ['malformed hydration',f=>{f.state.identityHydrationRevision='2';},/well formed|identityHydrationRevision/],
 ['missing member session',f=>{delete f.state.me.sessionId;},/Berth|meSessionId/],
 ['missing player role',f=>{delete f.state.me.role;},/Berth|playerRole/],
 ['missing assignment',f=>{delete f.state.me.assignedRoleId;},/Seat|Berth|assignedRoleId/],
 ['missing active console',f=>{delete f.state.me.activeConsoleRoleId;},/Berth|activeConsoleRoleId/],
 ['missing seat',f=>{delete f.state.me.seatId;},/seatId/],
 ['missing generation',f=>{delete f.state.me.connectionGeneration;},/Berth|connectionGeneration/],
 ['foreign UID',f=>{f.authUser.uid='foreign-user';},/sameActor|UID|OwnPlayer|Berth/],
 ['foreign session',f=>{f.state.session.id='foreign-session';},/Berth|sessionId/],
 ['foreign member session',f=>{f.state.me.sessionId='foreign-session';},/Berth|meSessionId/],
 ['foreign profile role',f=>{f.deps.profile.activeDemoActorProfile={roleId:'wing-commander',sessionId:f.original.sessionId};},/well formed|profileRoleId/],
 ['foreign profile session',f=>{f.deps.profile.activeDemoActorProfile={roleId:f.state.me.assignedRoleId,sessionId:'foreign-session'};},/profileRoleId|profileSessionId/],
 ['foreign assignment',f=>{f.state.me.assignedRoleId='wing-commander';},/well formed|Seat|Berth|assignedRoleId/],
 ['foreign active console',f=>{f.state.me.activeConsoleRoleId='wing-commander';},/well formed|Berth|activeConsoleRoleId/],
 ['foreign seat',f=>{f.state.me.seatId='wing-commander';},/well formed|seatId/],
 ['foreign group',f=>{f.state.me.fleetGroupId='fleet-2';},/Scope|Berth|fleetGroupId/],
 ['replacement role',f=>{f.state.me.replacementRoleId='wing-commander';},/well formed|Berth|replacementRoleId/],
 ['replacement status',f=>{f.state.me.replacementStatus='assigned';},/Berth|replacementStatus/],
 ['generation drift',f=>{f.state.me.connectionGeneration++;},/Berth|connectionGeneration/],
 ['malformed generation',f=>{f.state.me.connectionGeneration='2';},/well formed|connectionGeneration/],
 ['document drift',f=>{f.browserPerformance.timeOrigin++;},/documentTimeOrigin/],
 ['revoked canonical seat',f=>{f.state.seats[0].holderUid='foreign-user';},/CanonicalSeat/],
 ['revoked berth',f=>{f.state.session.currentActorBerthAuthority.actorUid='foreign-user';},/Berth/],
 ['missing berth',f=>{delete f.state.session.currentActorBerthAuthority;},/Berth/],
 ['revoked SDK',f=>{f.sdkAuthority.hasServerSessionAuthority=false;},/sdkHasServerAuthority/],
 ['pending SDK resume',f=>{f.sdkAuthority.resumePending=true;},/false/],
 ['disconnected member',f=>{f.state.me.connected=false;},/OwnPlayer|Berth/],
 ['cached projection',f=>{f.state.sessionSnapshotFreshness='cache';},/server/],
 ['missing discovery',f=>{delete f.state.session.playerDiscovery;},/discovery|entitled ship/],
 ['foreign discovery',f=>{f.state.session.playerDiscovery.shipId='foreign-ship';},/discovery|entitled ship/],
 ['discovery revision drift',f=>{f.state.session.playerDiscovery.revision++;},/discovery/],
]){
 test(`Attempt26 actual PDF getter bookend rejects ${name}`,async()=>{
  const f=await runtimeObserverFixture(),reached=mutateRuntimeObserverAt(f,'source getter',mutate);
  await assert.rejects(f.invoke(),reason);
  assert.equal(reached(),true,'The normal browser SDK getter must actually run.');
  assert.deepEqual(f.actorSurface.effects.clicks,[]);
 });
}

for(const [name,mutate] of [
 ['missing airspace',f=>{delete f.state.session.turnPhase.airspace.state;}],
 ['null airspace',f=>{f.state.session.turnPhase.airspace.state=null;}],
 ['invalid airspace',f=>{f.state.session.turnPhase.airspace.state='open';}],
 ['missing turnState phase',f=>{delete f.state.session.turnState.phase;}],
 ['mixed phase pair',f=>{f.state.session.turnState.phase='coordination';}],
 ['missing phase revision',f=>{delete f.state.session.turnState.phaseRevision;}],
 ['malformed phase revision',f=>{f.state.session.turnState.phaseRevision='5';}],
 ['missing Team deadline',f=>{delete f.state.session.turnPhase.teamPhaseEndsAt;}],
 ['invalid Team instant',f=>{f.state.session.turnPhase.teamPhaseEndsAt='not-an-instant';f.state.session.turnState.endsAt='not-an-instant';}],
 ['missing source start',f=>{delete f.state.session.turnState.startedAt;}],
 ['automatic phase',f=>{f.state.session.turnPhase.progression='automatic';}],
 ['foreign cycle',f=>{f.state.session.turnState.currentTurn=3;}],
]){
 test(`Attempt26 raw ${name} fails before canonical freeze can normalize expected Team`,async()=>{
  const f=await runtimeObserverFixture(),reached=mutateRuntimeObserverAt(f,'canonical freeze',mutate);
  await assert.rejects(f.invoke());assert.equal(reached(),true,'The actual canonical adapter boundary must run.');
  assert.deepEqual(f.actorSurface.effects.clicks,[]);
 });
}

test('Attempt26 actual SDK atomic enrichment cannot hide transient generation drift',async()=>{
 const f=await runtimeObserverFixture();let reached=false;
 f.hooks.produced=(kind,value)=>{if(kind==='shared'){reached=true;value.connectionGeneration++;}};
 await assert.rejects(f.invoke(),/connectionGeneration/);assert.equal(reached,true);
 assert.deepEqual(f.actorSurface.effects.clicks,[]);
});

for(const key of ['replacementRoleId','replacementStatus','seatId','discoveryAuthority','identityHydrationRevision']){
 test(`Attempt26 missing produced canonical ${key} cannot be filled from original identity`,async()=>{
  const f=await runtimeObserverFixture();let reached=false;
  f.hooks.produced=(kind,value,count)=>{if(kind==='atomic'&&count===3){reached=true;delete value[key];}};
  await assert.rejects(f.invoke());assert.equal(reached,true);
  assert.deepEqual(f.actorSurface.effects.clicks,[]);
 });
}

test('Attempt26 actual Auth digest-time change remains fatal after a normal PDF getter',async()=>{
 const f=await runtimeObserverFixture();let reached=false;
 mutateRuntimeObserverAt(f,'source getter',value=>{value.hooks.digest=()=>{
  reached=true;value.authUser.uid='foreign-during-digest';};});
 await assert.rejects(f.invoke(),/UID changed/);assert.equal(reached,true);
 assert.deepEqual(f.actorSurface.effects.clicks,[]);
});

test('Attempt26 actual canonical final callback retains the original operation deadline',async()=>{
 const f=await runtimeObserverFixture(),deadline=f.opts.deadlineAt;
 const reached=mutateRuntimeObserverAt(f,'final choose',value=>{value.opts.deadlineAt=deadline;});
 // Expire the same captured deadline through the existing clock, without a
 // delay or resetting the consumer's operation context.
 const now=Date.now;
 const capture=f.hooks.capture;
 f.hooks.capture=()=>{capture();Date.now=()=>deadline+1;};
 try{await assert.rejects(f.invoke(),/deadline|expired/);}finally{Date.now=now;}
 assert.equal(reached(),true);assert.deepEqual(f.actorSurface.effects.clicks,[]);
});

test('Attempt26 actual PDF terminal rebookend retains canonical identity and zero choice credit',async()=>{
 const f=await runtimeObserverFixture(),observations=[];
 const reached=mutateRuntimeObserverAt(f,'source getter',value=>value.finalize());
 f.opts.onSourceProgress=async value=>observations.push(value);
 assert.equal(await f.invoke(),undefined);assert.equal(reached(),true);
 assert.equal(observations.length,1);assert.equal(observations[0].observedAttack.status,'resolved');
 assert.equal(observations[0].actionCredit,false);assert.equal(observations[0].acceptanceCredit,false);
 assert.ok(observations[0].consumedObservations.authorityScopes.length>=4);
 assert.deepEqual(f.actorSurface.effects.clicks,[]);assert.equal(f.counts.capture,0);
});

test('Attempt26 actual PDF terminal rebookend never masks a canonical SDK revocation',async()=>{
 const f=await runtimeObserverFixture();let reached=false,terminalPhaseReads=0;
 mutateRuntimeObserverAt(f,'source getter',value=>value.finalize());
 f.hooks.phase=()=>{if(f.state.session.turnState.phase==='coordination'&&++terminalPhaseReads===2){
  reached=true;f.sdkAuthority.hasServerSessionAuthority=false;}};
 await assert.rejects(f.invoke(),/sdkHasServerAuthority/);assert.equal(reached,true);
 assert.deepEqual(f.actorSurface.effects.clicks,[]);assert.equal(f.counts.capture,0);
});

for(const [name,mutate] of [
 ['missing raw phase',f=>{delete f.state.session.turnState.phase;}],
 ['SDK revocation',f=>{f.sdkAuthority.hasServerSessionAuthority=false;}],
 ['discovery drift',f=>{f.state.session.playerDiscovery.revision++;}],
]){
 test(`Attempt26 default Wing final choose rejects ${name} from actual producers`,async()=>{
  const f=await runtimeObserverFixture('wing-commander');let reached=false;
  f.actorSurface.page.getByRole=(_kind,{name})=>({isVisible:async()=>name==='Launch Fighter Wing Alpha',
   isEnabled:async()=>true,click:async()=>f.actorSurface.effects.clicks.push(name)});
  f.hooks.capture=()=>{reached=true;mutate(f);};
  await assert.rejects(dispatchStationWingChoice(f.current,{deadlineAt:f.opts.deadlineAt,
   recipient:f.actorSurface,fullMember:f.assertMember,evidence:{stationWingOriginal:f.original},
   recoveredLaunches:new Map(),directory:'/tmp/unused-observer-fixture',readAttack:f.opts.readAttack,
   readTurnState:f.readPhase,gmAuthority:f.opts.gmAuthority,action:f.action}));
  assert.equal(reached,true);assert.deepEqual(f.actorSurface.effects.clicks,[]);
 });
}

// These initial states intentionally precede the first combat scope. The
// original fullMember remains legitimate; discovery must earn initial
// audience validity rather than becoming valid through later equality.
for(const [name,mutate] of [
 ['missing',f=>{delete f.state.session.playerDiscovery;}],
 ['foreign group and ship',f=>{Object.assign(f.state.session.playerDiscovery,{groupId:'fleet-foreign',shipId:'foreign-ship'});}],
 ['malformed revision and duplicate vessels',f=>{Object.assign(f.state.session.playerDiscovery,{revision:'4',fleetGroupVesselIds:['refinery-124','refinery-124']});}],
 ['null',f=>{f.state.session.playerDiscovery=null;}],
 ['incomplete group',f=>{delete f.state.session.playerDiscovery.groupId;}],
 ['incomplete revision',f=>{delete f.state.session.playerDiscovery.revision;}],
 ['negative revision',f=>{f.state.session.playerDiscovery.revision=-1;}],
 ['incomplete vessels',f=>{delete f.state.session.playerDiscovery.fleetGroupVesselIds;}],
 ['empty vessels',f=>{f.state.session.playerDiscovery.fleetGroupVesselIds=[];}],
 ['malformed vessels',f=>{f.state.session.playerDiscovery.fleetGroupVesselIds=[null];}],
 ['missing entitled ship',f=>{delete f.state.session.playerDiscovery.shipId;}],
 ['unknown entitled ship',f=>{f.state.session.playerDiscovery.shipId='unknown-ship';}],
 ['foreign berth ship',f=>{f.state.session.memberSessionScope.vesselIds.push('icebreaker');
   f.state.session.currentActorBerthAuthority.shipId='icebreaker';}],
]){
 test(`Attempt26 initial ${name} discovery cannot become frozen PDF authority`,async()=>{
  const f=await runtimeObserverFixture();mutate(f);
  await assert.rejects(f.invoke(),/discovery|audience|berth|ship/i);
  assert.equal(f.counts.capture,0);assert.deepEqual(f.actorSurface.effects.reads,[]);
  assert.deepEqual(f.actorSurface.effects.clicks,[]);
 });
}

for(const [name,mutate] of [
 ['missing discovery',f=>{delete f.state.session.playerDiscovery;}],
 ['foreign entitlement',f=>{f.state.session.playerDiscovery.shipId='foreign-ship';}],
 ['duplicate vessels',f=>{f.state.session.playerDiscovery.fleetGroupVesselIds=['aegis','aegis'];}],
]){
 test(`Attempt26 initial default Wing ${name} fails before normal capture`,async()=>{
  const f=await runtimeObserverFixture('wing-commander');mutate(f);
  f.actorSurface.page.getByRole=(_kind,{name})=>({isVisible:async()=>name==='Launch Fighter Wing Alpha',
   isEnabled:async()=>true,click:async()=>f.actorSurface.effects.clicks.push(name)});
  await assert.rejects(dispatchStationWingChoice(f.current,{deadlineAt:f.opts.deadlineAt,
   recipient:f.actorSurface,fullMember:f.assertMember,evidence:{stationWingOriginal:f.original},
   recoveredLaunches:new Map(),directory:'/tmp/unused-observer-fixture',readAttack:f.opts.readAttack,
   readTurnState:f.readPhase,gmAuthority:f.opts.gmAuthority,action:f.action}),/discovery|audience|berth|ship/i);
  assert.equal(f.counts.capture,0);assert.deepEqual(f.actorSurface.effects.clicks,[]);
 });
}

test('Attempt26 initial Press craft scope with null berth remains a legitimate observation and zero Station intent',async()=>{
 const f=await runtimeObserverFixture('press-officer');
 Object.assign(f.state.me,{assignedRoleId:null,seatId:null});f.state.seats=[];
 f.state.session.currentActorBerthAuthority=null;
 f.state.session.memberSessionScope={groupId:'fleet-1',vesselIds:[],craftIds:['snn-press-shuttle']};
 f.state.session.shuttleControl={'snn-press-shuttle':{shuttleId:'snn-press-shuttle',ownerRoleId:'press-officer',
  ownerUid:f.authUser.uid,holderUid:f.authUser.uid,revision:1}};
 f.state.session.playerDiscovery={groupId:'fleet-1',revision:4,fleetGroupVesselIds:[]};
 const observe=async()=>{const member=await f.readMember();assert.deepEqual(member.invalidFields,[]);
  assert.equal(member.sdkHasServerAuthority,true);assert.equal(member.sameActor,true);
  assert.equal(member.currentMemberBerthPresent,true);assert.equal(member.currentMemberBerthNull,true);
  assert.equal(member.pressCraftScopeMatches,true);return member;};
 const sample=await readStationWingChoiceAuthority(f.current,{roleId:'press-officer',surface:f.actorSurface},
  {...f.opts,assertActor:observe});
 assert.equal(sample.entitledShipId,null);assert.equal(sample.assignedRoleId,null);
 assert.equal(await dispatchStationCrewChoice({...f.current,currentStep:'boarding'},
  {...f.opts,assertActor:observe,readAttack:async()=>({...f.current,currentStep:'boarding'})}),undefined);
 assert.equal(f.counts.capture,0);assert.deepEqual(f.actorSurface.effects.reads,[]);
 assert.deepEqual(f.actorSurface.effects.clicks,[]);
});

test('Attempt26 scoped GM with absent ship berth preserves actual lease authority without Station intent',async()=>{
 const f=await runtimeObserverFixture();
 Object.assign(f.state.me,{role:'gm',assignedRoleId:null,activeConsoleRoleId:null,seatId:null,fleetGroupId:null});
 f.state.seats=[];delete f.state.session.currentActorBerthAuthority;delete f.state.session.playerDiscovery;
 f.state.gmInstance={id:'current-gm-lease',uid:f.authUser.uid,sessionId:f.original.sessionId};
 const observe=async()=>{const member=await f.readMember();assert.deepEqual(member.invalidFields,[]);
  assert.equal(member.sdkHasServerAuthority,true);assert.equal(member.sameActor,true);
  assert.equal(member.playerRole,'gm');assert.equal(member.gmInstanceOwned,true);return member;};
 const sample=await readStationWingChoiceAuthority(f.current,{roleId:'facilitator',surface:f.actorSurface},
  {...f.opts,assertActor:observe});
 assert.equal(sample.entitledShipId,null);assert.equal(sample.instanceId,'current-gm-lease');
 assert.equal(sample.gmInstanceOwned,true);assert.equal(f.counts.capture,0);
 assert.deepEqual(f.actorSurface.effects.clicks,[]);
});

// Runtime-shaped public EO views from the real SDK producer; no private roster.
function eoRange(range='medium-range',extra={}) {return {type:'wolf-range-action-choice-view',sessionId,turn:3,revision:8,currentStep:range,range,deadlineAt:'9999-12-31T23:59:59.999Z',choiceStatus:'pending',eligibleActions:[{actionId:'missile',sourceId:'aegis-missile-launchers',range},{actionId:'laser',sourceId:'aegis-point-defence-lasers',range}].filter(row=>range==='medium-range'||row.sourceId===(range==='long-range'?'aegis-missile-launchers':'aegis-point-defence-lasers')),hitSlots:[],contacts:[{contactId:'Wolf contact 1',targetShipId:'aegis',available:true},{contactId:'Wolf contact 2',targetShipId:'icebreaker',available:true},{contactId:'Wolf contact 3',targetShipId:'shepherd',available:true}],...extra};}
function eoSurface(view,extra={}) {return surface('executive-officer',view,{entitledShipId:'aegis',path:'/ships/aegis/roles/executive-officer',defenceOptions:(view.contacts??[]).map(row=>row.contactId),...extra});}
test('actual PDF Medium consumer focuses last public contact without a hidden type preference',async()=>{
 const view={type:'wolf-fighter-range-action-view',sessionId,attackId:'attack-p',turn:3,revision:8,wingId:'pdf-escort-fighter-wing',wingLabel:'P.D.F. Escort Fighter Wing',range:'medium-range',choiceStatus:'pending',launched:true,fighters:[{fighterIndex:0}],targets:[{instanceId:'first',label:'Wolf contact 1',targetNumber:1},{instanceId:'last',label:'Wolf contact 2',targetNumber:2}]};
 const pdf=surface('refinery-124-pdf-colonel',view);let receipt;await dispatchStationCrewChoice(attack('medium-range'),options([{roleId:pdf.label,surface:pdf}],attack('medium-range'),r=>receipt=r));assert.equal(receipt.metadata.expectedRequest.actions[0].targetContactId,'last');
});
for(const range of ['long-range','medium-range','short-range']) test(`actual EO ${range} uses only offered missile/laser actions through normal capture`,async()=>{
 const ids=range==='long-range'?['missile']:range==='short-range'?['laser']:['missile','laser'];const offered=eoRange(range);offered.eligibleActions=offered.eligibleActions.filter(row=>ids.includes(row.actionId));const eo=eoSurface(offered);let receipt;const result=await dispatchStationCrewChoice(attack(range),options([{roleId:eo.label,surface:eo}],attack(range),r=>receipt=r));assert.deepEqual(result,{committed:true});assert.equal(receipt.endpoint,'commitWolfRangeActionChoice');assert.deepEqual(receipt.metadata.expectedRequest.actionIds,ids);assert.equal(receipt.metadata.deadlineAt,deadlineAt);assert.deepEqual(eo.effects.clicks,['Use selected actions']);assert.equal(eo.effects.reads[0].endpoint,'getWolfRangeActionChoice');
});
test('actual EO depleted weapons explicitly pass without replenishing or inventing an action',async()=>{
 const eo=eoSurface(eoRange('long-range',{eligibleActions:[]}));let receipt;assert.deepEqual(await dispatchStationCrewChoice(attack('long-range'),options([{roleId:eo.label,surface:eo}],attack('long-range'),r=>receipt=r)),{committed:true});assert.deepEqual(receipt.metadata.expectedRequest.actionIds,[]);assert.deepEqual(eo.effects.clicks,['Pass this range']);
});
test('actual EO locked hit slots assign distinct last public contacts from the offered view',async()=>{
 const eo=eoSurface(eoRange('medium-range',{choiceStatus:'targets-required',hitSlots:[{actionId:'missile',count:2,damagePerHit:1},{actionId:'laser',count:1,damagePerHit:1}]}));let receipt;assert.deepEqual(await dispatchStationCrewChoice(attack('medium-range'),options([{roleId:eo.label,surface:eo}],attack('medium-range'),r=>receipt=r)),{committed:true});assert.equal(receipt.endpoint,'assignWolfRangeTargets');assert.deepEqual(receipt.metadata.expectedRequest.assignments,[{actionId:'missile',contactIds:['Wolf contact 3','Wolf contact 2']},{actionId:'laser',contactIds:['Wolf contact 3']}]);assert.deepEqual(eo.effects.clicks,['Commit target assignments']);
});
test('actual EO Short uses public coverage damage before non-wing contacts',async()=>{
 const contacts=[{contactId:'Wolf contact 1',targetShipId:'aegis',available:true,requiredCoverageDamage:1},{contactId:'Wolf contact 2',targetShipId:'aegis',available:true,requiredCoverageDamage:null},{contactId:'Wolf contact 3',targetShipId:'aegis',available:true,requiredCoverageDamage:1}];
 const eo=eoSurface(eoRange('short-range',{choiceStatus:'targets-required',contacts,hitSlots:[{actionId:'laser',count:2,damagePerHit:1}]}));let receipt;await dispatchStationCrewChoice(attack('short-range'),options([{roleId:eo.label,surface:eo}],attack('short-range'),r=>receipt=r));assert.deepEqual(receipt.metadata.expectedRequest.assignments,[{actionId:'laser',contactIds:['Wolf contact 3','Wolf contact 1']}]);
});
for(const count of [0,4]) test(`actual EO ${count} locked hits caps targets to live distinct contacts`,async()=>{
 const eo=eoSurface(eoRange('long-range',{choiceStatus:'targets-required',eligibleActions:[{actionId:'missile',sourceId:'aegis-missile-launchers',range:'long-range'}],hitSlots:[{actionId:'missile',count,damagePerHit:2}],contacts:[{contactId:'Wolf contact 9',targetShipId:'aegis',available:true}]}));let receipt;await dispatchStationCrewChoice(attack('long-range'),options([{roleId:eo.label,surface:eo}],attack('long-range'),r=>receipt=r));assert.deepEqual(receipt.metadata.expectedRequest.assignments,[{actionId:'missile',contactIds:count?['Wolf contact 9']:[]}]);
});
for(const kind of ['warheads','command']) test(`actual EO optional ${kind} choice explicitly passes without ore or private targeting`,async()=>{
 const warheads={type:'aegis-enriched-warhead-view',sessionId,attackId:'attack-p',turn:3,revision:8,eligible:kind==='warheads',choiceStatus:kind==='warheads'?'pending':'unavailable',oreCost:5};const command={type:'aegis-command-and-control-view',sessionId,turn:3,revision:8,eligible:true,commanderAssigned:false,rerollsFinalized:true,targets:[{instanceId:'opaque-only'}]};
 const eo=eoSurface(warheads,{responses:{getAegisEnrichedWarheadChoice:warheads,getAegisCommandAndControl:command}});let receipt;assert.deepEqual(await dispatchStationCrewChoice(attack('targeting'),options([{roleId:eo.label,surface:eo}],attack('targeting'),r=>receipt=r)),{committed:true});assert.equal(receipt.endpoint,kind==='warheads'?'commitAegisEnrichedWarheadChoice':'passAegisCommandAndControl');assert.equal(receipt.metadata.expectedRequest.choice,kind==='warheads'?'pass':undefined);assert.deepEqual(eo.effects.clicks,[kind==='warheads'?'Pass enriched warheads':'Pass Command and Control']);
});
for(const [name,mutate] of [
 ['foreign session',v=>{v.sessionId='foreign'}],['stale revision',v=>{v.revision--}],['malformed action',v=>{v.eligibleActions[0].sourceId='private-admin'}],['duplicate contact',v=>{v.contacts.push({...v.contacts[0]})}],['unknown unavailable',v=>{v.type='wolf-range-action-choice-unavailable';v.reason='invented'}],['malformed locked hits',v=>{v.choiceStatus='targets-required';v.hitSlots=[{actionId:'missile',count:-1,damagePerHit:1}]}],['missing Short coverage',v=>{v.range=v.currentStep='short-range';v.choiceStatus='targets-required';v.hitSlots=[{actionId:'laser',count:1,damagePerHit:1}]}],
]) test(`actual EO ${name} fails before capture`,async()=>{
 const view=eoRange();mutate(view);const eo=eoSurface(view);let captures=0;await assert.rejects(dispatchStationCrewChoice(attack(view.range),options([{roleId:eo.label,surface:eo}],attack(view.range),()=>captures++)));assert.equal(captures,0);assert.deepEqual(eo.effects.clicks,[]);
});
for(const [name,mutate] of [
 ['foreign UID',s=>{s.testActor.uidHash='foreign'}],['foreign canonical seat',s=>{s.testActor.seatId='wing-commander'}],['foreign berth',s=>{s.testAuthority.currentBerthShipId='icebreaker'}],['missing discovery',s=>{delete s.testAuthority.discoveryAuthority}],['revoked console',s=>{s.testActor.activeConsoleRoleId=null}],['invalid source phase',s=>{s.testActor.airspace='lifted'}],
]) test(`actual EO ${name} remains fatal without any capture`,async()=>{const eo=eoSurface(eoRange());mutate(eo);let captures=0;await assert.rejects(dispatchStationCrewChoice(attack('medium-range'),options([{roleId:eo.label,surface:eo}],attack('medium-range'),()=>captures++)));assert.equal(captures,0);assert.deepEqual(eo.effects.clicks,[]);});
test('actual EO original expired deadline has zero reads and actions',async()=>{const eo=eoSurface(eoRange());await assert.rejects(dispatchStationCrewChoice(attack('medium-range'),options([{roleId:eo.label,surface:eo}],attack('medium-range'),undefined,Date.now()-1)));assert.deepEqual(eo.effects.reads,[]);assert.deepEqual(eo.effects.clicks,[]);});
test('actual EO unknown getter denial cannot become a pass',async()=>{const eo=eoSurface(eoRange());const error=Error('permission denied');eo.callable=async()=>{throw error};await assert.rejects(dispatchStationCrewChoice(attack('medium-range'),options([{roleId:eo.label,surface:eo}],attack('medium-range'))),e=>e===error);assert.deepEqual(eo.effects.clicks,[]);});

test('actual summary and canonical EO producer drive normal SDK use then locked-target capture receipts',async()=>{
 const f=await runtimeObserverFixture('executive-officer',eoRange());f.current.currentStep='medium-range';
 const summary=await f.actorSurface.observe();assert.equal(summary.hydrationRevision,2);assert.equal(Object.hasOwn(summary,'identityHydrationRevision'),false);
 // The actual response producer replaces turn/cycle above; paint uses that live value.
 const panel=f.actorSurface.page.getByRole('region',{name:'Wolf range actions'}),text=panel.innerText;
 panel.innerText=async()=> (await text()).replace('Cycle 3','Cycle 2');
 let requests=[];const normalCapture=f.opts.action;f.opts.action=async(...args)=>{requests.push(args[3].expectedRequest);return normalCapture(...args)};
 assert.deepEqual(await f.invoke(),{committed:true});assert.equal(f.counts.capture,1);assert.ok(f.counts.summary>0&&f.counts.atomic>0&&f.counts.shared>0&&f.counts.member>0);assert.equal(f.actorSurface.effects.reads[0].endpoint,'getWolfRangeActionChoice');assert.deepEqual(requests[0].actionIds,['missile','laser']);
 Object.assign(f.response,{revision:2,choiceStatus:'targets-required',hitSlots:[{actionId:'missile',count:1,damagePerHit:1},{actionId:'laser',count:0,damagePerHit:1}]});f.current.revision=2;
 assert.deepEqual(await f.invoke(),{committed:true});assert.equal(f.counts.capture,2);assert.deepEqual(requests[1].assignments,[{actionId:'missile',contactIds:['Wolf contact 3']},{actionId:'laser',contactIds:[]}]);assert.deepEqual(f.actorSurface.effects.clicks,['Use selected actions','Commit target assignments']);
});
for(const [name,change] of [
 ['lost active console',f=>{f.state.me.activeConsoleRoleId=null;f.state.session.currentActorBerthAuthority.activeConsoleRoleId=null}],
 ['missing actual berth',f=>{delete f.state.session.currentActorBerthAuthority}],
 ['foreign discovery',f=>{f.state.session.playerDiscovery.groupId='fleet-foreign'}],
 ['SDK authority revoked',f=>{f.sdkAuthority.hasServerSessionAuthority=false}],
]) test(`actual EO producer ${name} has zero normal capture`,async()=>{const f=await runtimeObserverFixture('executive-officer',eoRange());f.current.currentStep='medium-range';change(f);await assert.rejects(f.invoke());assert.equal(f.counts.capture,0);assert.deepEqual(f.actorSurface.effects.clicks,[]);});

for(const [name,mutate] of [
 ['unknown private view field',v=>{v.privateRoster=[{shipId:'battlestation'}]}],
 ['impossible Long laser',v=>{v.range=v.currentStep='long-range';v.eligibleActions=[{actionId:'laser',sourceId:'aegis-point-defence-lasers',range:'long-range'}]}],
]) test(`actual EO ${name} is rejected before any weapon capture`,async()=>{const view=eoRange();mutate(view);const eo=eoSurface(view);let captures=0;await assert.rejects(dispatchStationCrewChoice(attack(view.range),options([{roleId:eo.label,surface:eo}],attack(view.range),()=>captures++)));assert.equal(captures,0);assert.deepEqual(eo.effects.clicks,[]);});
test('actual EO known waiting range view omits its real panel and makes no action',async()=>{
 const view={type:'wolf-range-action-choice-unavailable',sessionId,reason:'waiting'};const eo=eoSurface(view);eo.page.getByRole=()=>({isVisible:async()=>false});let captures=0;assert.equal(await dispatchStationCrewChoice(attack('medium-range'),options([{roleId:eo.label,surface:eo}],attack('medium-range'),()=>captures++,Date.now()+300)),undefined);assert.equal(eo.effects.reads[0].endpoint,'getWolfRangeActionChoice');assert.equal(captures,0);assert.deepEqual(eo.effects.clicks,[]);
});
test('actual EO warhead choice missing attack identity cannot use original expected identity',async()=>{const view={type:'aegis-enriched-warhead-view',sessionId,turn:3,revision:8,eligible:true,choiceStatus:'pending',oreCost:5};const eo=eoSurface(view);await assert.rejects(dispatchStationCrewChoice(attack('targeting'),options([{roleId:eo.label,surface:eo}],attack('targeting'))));assert.deepEqual(eo.effects.clicks,[]);});

for(const reason of ['not-in-range','unknown']) test(`actual EO unavailable ${reason} remains fatal with no intent`,async()=>{const eo=eoSurface({type:'wolf-range-action-choice-unavailable',sessionId,reason});await assert.rejects(dispatchStationCrewChoice(attack('medium-range'),options([{roleId:eo.label,surface:eo}],attack('medium-range'))));assert.deepEqual(eo.effects.clicks,[]);});
test('actual EO known waiting source cannot use a stale present enabled weapon panel',async()=>{const eo=eoSurface({type:'wolf-range-action-choice-unavailable',sessionId,reason:'waiting'});let captures=0;assert.equal(await dispatchStationCrewChoice(attack('medium-range'),options([{roleId:eo.label,surface:eo}],attack('medium-range'),()=>captures++)),undefined);assert.equal(captures,0);assert.deepEqual(eo.effects.clicks,[]);});

for(const kind of ['use','targets']) test(`actual EO ${kind} final callback cancels validated progress without click or receipt`,async()=>{
 const view=eoRange('medium-range',kind==='targets'?{choiceStatus:'targets-required',hitSlots:[{actionId:'missile',count:1,damagePerHit:1}]}:{}),eo=eoSurface(view),current=attack('medium-range');let latest=current,captures=0,observations=[];
 const opts=options([{roleId:eo.label,surface:eo}],current);opts.readAttack=async()=>latest;opts.onSourceProgress=async value=>observations.push(value);opts.action=async(_surface,_endpoint,choose)=>{captures++;latest={...current,revision:12,currentStep:'short-range'};await choose();throw Error('Canceled callback must not manufacture a receipt');};
 assert.equal(await dispatchStationCrewChoice(current,opts),undefined);assert.equal(captures,1);assert.deepEqual(eo.effects.clicks,[]);assert.equal(observations.length,1);assert.equal(observations[0].actionCredit,false);assert.equal(observations[0].deadlineAt,deadlineAt);
});
test('actual EO frozen identity drift remains fatal with simultaneous later stage',async()=>{const eo=eoSurface(eoRange()),current=attack('medium-range'),opts=options([{roleId:eo.label,surface:eo}],current);let latest=current;opts.readAttack=async()=>latest;opts.action=async(_surface,_endpoint,choose)=>{eo.testActor.uidHash='foreign';latest={...current,revision:10,currentStep:'short-range'};await choose();};await assert.rejects(dispatchStationCrewChoice(current,opts));assert.deepEqual(eo.effects.clicks,[]);});
test('actual EO capture cannot extend the original final callback deadline',async()=>{const eo=eoSurface(eoRange()),current=attack('medium-range'),opts=options([{roleId:eo.label,surface:eo}],current,undefined,Date.now()+2000);const actualNow=Date.now;opts.action=async(_surface,_endpoint,choose)=>{Date.now=()=>opts.deadlineAt+1;await choose();};try{await assert.rejects(dispatchStationCrewChoice(current,opts),/deadline|expired/i);}finally{Date.now=actualNow;}assert.deepEqual(eo.effects.clicks,[]);});
for(const kind of ['use','targets']) test(`actual EO ${kind} unknown mutation receipt is fatal and never retried`,async()=>{const eo=eoSurface(eoRange('medium-range',kind==='targets'?{choiceStatus:'targets-required',hitSlots:[{actionId:'missile',count:1,damagePerHit:1}]}:{})),current=attack('medium-range'),opts=options([{roleId:eo.label,surface:eo}],current);let captures=0;opts.action=async(_surface,endpoint,choose,metadata)=>{captures++;await choose();return {endpoint,data:metadata.expectedRequest,httpStatus:200,result:{status:'unknown'}};};await assert.rejects(dispatchStationCrewChoice(current,opts));assert.equal(captures,1);assert.equal(eo.effects.clicks.length,1);});
test('actual EO waiting reply still rejects revoked actor authority before zero intent',async()=>{const eo=eoSurface({type:'wolf-range-action-choice-unavailable',sessionId,reason:'waiting'});eo.testActor.activeConsoleRoleId=null;await assert.rejects(dispatchStationCrewChoice(attack('medium-range'),options([{roleId:eo.label,surface:eo}],attack('medium-range'))));assert.deepEqual(eo.effects.clicks,[]);});
test('actual EO Short may target only offered Fighter Wing contacts when full coverage is impossible',async()=>{const view=eoRange('short-range',{choiceStatus:'targets-required',hitSlots:[{actionId:'laser',count:1,damagePerHit:1}],contacts:[{contactId:'Wing first',targetShipId:'aegis',available:true,requiredCoverageDamage:1},{contactId:'Hull last',targetShipId:'aegis',available:true,requiredCoverageDamage:null},{contactId:'Wing last',targetShipId:'aegis',available:true,requiredCoverageDamage:1}]});const eo=eoSurface(view);let receipt;await dispatchStationCrewChoice(attack('short-range'),options([{roleId:eo.label,surface:eo}],attack('short-range'),r=>receipt=r));assert.deepEqual(receipt.metadata.expectedRequest.assignments,[{actionId:'laser',contactIds:['Wing last']}]);});
test('actual EO Short coverage accumulates actual damage across distinct actions before hull choice',async()=>{const view=eoRange('short-range',{choiceStatus:'targets-required',eligibleActions:[{actionId:'laser',sourceId:'aegis-point-defence-lasers',range:'short-range'},{actionId:'support',sourceId:'highwall',range:'short-range'}],hitSlots:[{actionId:'laser',count:2,damagePerHit:1},{actionId:'support',count:1,damagePerHit:1}],contacts:[{contactId:'Wing',targetShipId:'aegis',available:true,requiredCoverageDamage:2},{contactId:'Hull',targetShipId:'aegis',available:true,requiredCoverageDamage:null}]});const eo=eoSurface(view);let receipt;await dispatchStationCrewChoice(attack('short-range'),options([{roleId:eo.label,surface:eo}],attack('short-range'),r=>receipt=r));assert.deepEqual(receipt.metadata.expectedRequest.assignments,[{actionId:'laser',contactIds:['Wing','Hull']},{actionId:'support',contactIds:['Wing']}]);});
test('actual EO later depleted source cannot reuse a prior offered weapon',async()=>{const current=attack('long-range'),view=eoRange('long-range'),eo=eoSurface(view);let requests=[];assert.deepEqual(await dispatchStationCrewChoice(current,options([{roleId:eo.label,surface:eo}],current,r=>requests.push(r.metadata.expectedRequest))),{committed:true});view.eligibleActions=[];assert.deepEqual(await dispatchStationCrewChoice(current,options([{roleId:eo.label,surface:eo}],current,r=>requests.push(r.metadata.expectedRequest))),{committed:true});assert.deepEqual(requests.map(r=>r.actionIds),[['missile'],[]]);assert.deepEqual(eo.effects.clicks,['Use selected actions','Pass this range']);});
