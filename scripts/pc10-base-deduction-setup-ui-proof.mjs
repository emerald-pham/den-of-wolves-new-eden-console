import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createTwoBrowserGameplay } from './pc10-two-browser-gameplay.mjs';
import { assertOriginalBaseActor, baseDeductionAssignments, captureBaseUiReceipt,
  proofHash, uidHash, waitForOriginalBaseActor, waitForBaseLoyaltyUiReceipt } from './pc10-base-combat-deduction-contracts.mjs';

/** Opt-in normal printed variant; this hook exercises no Cult private procedure. */
export function createBaseDeductionSetupHooks(options = {}) {
  const scenario = options.scenario ?? 'wolf-cult';
  assert.equal(scenario, 'wolf-cult');
  const report = { schemaVersion: 1, scenario, status: 'planned', actorUidsRecorded: false,
    privateProcedureAcceptance: false, adminGameplayWrites: false, fixtures: false,
    configuredHolders: [], requests: [] };
  let originalSetupGm;
  async function original(context) {
    const current = await context.gm.observe();
    assert.equal(current.sessionId, context.initial.sessionId);
    assert.equal(current.uidHash, context.initial.uidHash);
    assert.equal(current.playerRole, 'gm'); assert.equal(current.cycle, 0);
    assert.ok(['lobby', 'casting'].includes(current.phase));
    if (originalSetupGm) {
      assert.equal(current.uidHash, originalSetupGm.uidHash); assert.equal(current.instanceId, originalSetupGm.instanceId);
    }
    return waitForOriginalBaseActor({ inspect: () => context.gm.observe(), original: current });
  }
  const save = context => writeFile(`${context.directory}/base-deduction-setup.json`, `${JSON.stringify(report, null, 2)}\n`);
  async function onSetup(context) {
    const gmActor = await original(context); originalSetupGm = gmActor;
    const enable = context.gm.page.getByRole('button', { name: 'Enable Wolf Cult', exact: true });
    if (await enable.isVisible()) {
      assert.equal(await enable.isEnabled(), true, 'The confirmed count must offer the source-supported two-Wolf variant.');
      await enable.click();
    }
    assertOriginalBaseActor(await context.gm.observe(), gmActor);
    const enabled = context.gm.page.getByRole('button', { name: 'Disable Wolf Cult', exact: true });
    assert.equal(await enabled.getAttribute('aria-pressed'), 'true');
    report.status = 'awaiting-normal-confirmation-and-occupied-casting';
    report.preConfirmationChoice = { transport: 'normal GM UI optional configuration control',
      source: 'Enable Wolf Cult', uidHash: gmActor.uidHash, instanceFingerprint: proofHash(gmActor.instanceId) };
    await save(context);
  }
  async function onBeforeStart(context) {
    const { gm, initial, confirmed, roster } = context;
    const gmActor = await original(context), a = createTwoBrowserGameplay(context);
    assert.equal(gmActor.uidHash, confirmed.uidHash); assert.equal(gmActor.instanceId, confirmed.instanceId);
    async function readSource(suffix, settings) {
      await waitForOriginalBaseActor({ inspect: () => gm.observe(), original: gmActor });
      const value = await a.read('gm', suffix, settings); assertOriginalBaseActor(await gm.observe(), gmActor);
      return value;
    }
    const configuration = await gm.page.evaluate(async moduleUrl => {
      const { useSessionStore } = await import(moduleUrl), session = useSessionStore.getState().session;
      return { setupConfirmed: session?.setupConfirmed, configurationLocked: session?.configurationLocked,
        playerCount: session?.setup?.playerCount ?? session?.playerCount,
        wolfCultEnabled: session?.setup?.wolfCultEnabled ?? session?.wolfCultEnabled,
        universalArbourEnabled: session?.setup?.universalArbourEnabled ?? session?.universalArbourEnabled,
        activeRoleIds: session?.activeRoleIds, pressEnabled: session?.pressEnabled !== false,
        pressClaimed: session?.pressClaimed === true };
    }, gm.storeModuleUrl());
    assertOriginalBaseActor(await gm.observe(), gmActor);
    assert.equal(configuration.setupConfirmed, true); assert.notEqual(configuration.configurationLocked, true);
    assert.equal(configuration.wolfCultEnabled, true); assert.equal(configuration.universalArbourEnabled, false);
    assert.deepEqual(configuration.activeRoleIds, confirmed.activeRoleIds);
    const hasPress = roster.some(actor => actor.roleId === 'press-officer');
    assert.equal(hasPress, configuration.pressEnabled && configuration.pressClaimed);
    const holders = (await readSource('players', { collection: true })).map(holder => ({ ...holder, uid: holder.uid ?? holder.id }));
    const assignments = baseDeductionAssignments({ roster, holders, ...configuration, scenario, ...options });
    const panel = gm.page.getByRole('region', { name: 'Explicit loyalty setup', exact: true });
    await panel.waitFor();
    report.confirmed = { playerCount: configuration.playerCount, coreRoleCount: confirmed.activeRoleIds.length,
      pressHolders: Number(hasPress), holderCount: assignments.length, uidHash: gmActor.uidHash,
      transport: 'actual original GM occupied-actor/private census reads' };
    await save(context);
    for (const assignment of assignments) {
      const crewSurface = await a.select(assignment.roleId);
      const currentCrew = await crewSurface.observe();
      assert.equal(currentCrew.uidHash, uidHash(assignment.uid)); assert.equal(currentCrew.profileRoleId, assignment.roleId);
      assertOriginalBaseActor(currentCrew, currentCrew);
      const select = panel.getByRole('combobox', { name: 'Loyalty holder', exact: true });
      const deadline = Date.now() + 60_000;
      let offered = false;
      while (Date.now() < deadline) {
        assertOriginalBaseActor(await gm.observe(), gmActor);
        offered = await select.locator('option').evaluateAll((nodes, uid) => nodes.some(node => node.value === uid && !node.disabled), assignment.uid);
        if (offered) break;
        await delay(200);
      }
      if (!offered) {
        const editor = await gm.page.evaluate(async moduleUrl => {
          const { useSessionStore } = await import(moduleUrl), state = useSessionStore.getState();
          const section = document.querySelector('[aria-label="Explicit loyalty setup"]');
          return { censusStatus: state.gmLoyaltyCensusStatus,
            censusPresent: state.gmLoyaltyCensus !== null,
            connectedGm: state.me?.role === 'gm' && state.me.connected === true,
            pressClaimed: state.session?.pressClaimed === true,
            holderControlPresent: !!section?.querySelector('[aria-label="Loyalty holder"]'),
            setupBlockers: section?.querySelector('[aria-label="Loyalty setup blockers"]')?.textContent ?? '',
            readinessBlockers: section?.querySelector('[aria-label="Before-start readiness blockers"]')?.textContent ?? '',
            coverage: section?.querySelector('[aria-label="Explicit loyalty coverage"]')?.textContent ?? '' };
        }, gm.storeModuleUrl());
        assertOriginalBaseActor(await gm.observe(), gmActor);
        const sourceHolders = await readSource('players', { collection: true });
        const sourceHolder = sourceHolders.find(holder => (holder.uid ?? holder.id) === assignment.uid);
        report.blockedEditor = { roleId: assignment.roleId, uidHash: uidHash(assignment.uid),
          editor, sourceHolder: sourceHolder ? { connected: sourceHolder.connected === true,
            assignedRoleId: sourceHolder.assignedRoleId ?? null,
            activeConsoleRoleId: sourceHolder.activeConsoleRoleId ?? null,
            hasSeat: typeof sourceHolder.seatId === 'string',
            replacementPresent: sourceHolder.replacementStatus != null,
            escapePresent: sourceHolder.escapeState != null } : null,
          observedAt: new Date().toISOString(), readOnly: true, acceptanceCredit: 0 };
        await save(context);
      }
      assert.equal(offered, true, 'Use only the actual connected, occupied original holder offered by the GM UI.');
      const census = await readSource('loyaltyCensus/current'), existing = census?.entries?.find(entry => entry.uid === assignment.uid);
      if (existing) {
        assert.equal(existing.kind, assignment.kind, 'Do not overwrite another authored private scenario.');
        assert.equal(existing.suspicion, assignment.suspicion, 'Keep the explicit source suspicion choice; do not overwrite another scenario.');
        report.configuredHolders.push({ roleId: assignment.roleId, uidHash: uidHash(assignment.uid), kind: assignment.kind, suspicion: assignment.suspicion,
          transport: 'already configured source record, not a new UI acceptance' });
        await save(context); continue;
      }
      await select.selectOption(assignment.uid);
      await panel.getByRole('combobox', { name: 'Private loyalty type', exact: true }).selectOption(assignment.kind);
      // Read the production vocabulary; choose only a currently offered source value.
      const allowed = await gm.page.evaluate(async kind => {
        const { suspicionChoicesForGmLoyalty } = await import('/src/lib/gmLoyaltySetup.ts');
        return suspicionChoicesForGmLoyalty(kind);
      }, assignment.kind);
      const suspicionControl = panel.getByRole('combobox', { name: 'Suspicion', exact: true });
      const suspicionDeadline = Date.now() + 60_000;
      let painted = false;
      while (Date.now() < suspicionDeadline) {
        const values = await suspicionControl.locator('option').evaluateAll(nodes => nodes.map(node => Number(node.value)));
        painted = JSON.stringify(values) === JSON.stringify(allowed);
        if (painted) break;
        assertOriginalBaseActor(await gm.observe(), gmActor); await delay(200);
      }
      assert.equal(painted, true); assert.ok(allowed.includes(assignment.suspicion));
      await suspicionControl.selectOption(String(assignment.suspicion));
      const button = panel.getByRole('button', { name: 'Assign private loyalty', exact: true });
      assert.equal(await button.isEnabled(), true, `Normal source setup must offer ${assignment.kind} for the current holder.`);
      const receipt = await captureBaseUiReceipt({ surface: gm, endpoint: 'assignLoyalty', expectedActor: gmActor,
        expectedRequest: { targetUid: assignment.uid, kind: assignment.kind, suspicion: assignment.suspicion },
        decision: () => button.click(), record: async value => { report.requests.push(value); await save(context); } });
      assert.equal(receipt.sessionId, initial.sessionId); assert.deepEqual(receipt.assignedUids, [assignment.uid]);
      const capturedRequest = report.requests.at(-1).requestFingerprint;
      const uiCompletion = await waitForBaseLoyaltyUiReceipt({
        inspect: () => gm.observe(), original: gmActor, receipt, requestFingerprint: capturedRequest,
        inspectUi: async () => {
          const retry = panel.getByRole('button', { name: 'Retry exact request', exact: true });
          const retryVisible = await retry.isVisible();
          return { confirmed: await panel.locator('.gm-loyalty-setup__message').filter({
            hasText: 'Private record committed by the server. Aggregate coverage updates with the live GM projection.',
          }).isVisible() && !retryVisible,
          retryReady: retryVisible && await retry.isEnabled() };
        },
        retry: async () => {
          let retryFingerprint;
          const recovered = await captureBaseUiReceipt({ surface: gm, endpoint: 'assignLoyalty', expectedActor: gmActor,
            expectedRequest: { targetUid: assignment.uid, kind: assignment.kind, suspicion: assignment.suspicion },
            decision: () => panel.getByRole('button', { name: 'Retry exact request', exact: true }).click(),
            verifyReplay: false, record: async value => {
              retryFingerprint = value.requestFingerprint;
              report.requests.push({ ...value, visibleExactUiRecovery: true }); await save(context);
            } });
          return { receipt: recovered, requestFingerprint: retryFingerprint };
        },
      });
      report.configuredHolders.push({ roleId: assignment.roleId, uidHash: uidHash(assignment.uid), kind: assignment.kind,
        suspicion: assignment.suspicion, setupRevision: receipt.setupRevision, ...uiCompletion,
        transport: 'actual normal GM UI + exact original receipt recovery' });
      await save(context);
    }
    const census = await readSource('loyaltyCensus/current');
    for (const assignment of assignments) {
      const matches = census?.entries?.filter(entry => entry.uid === assignment.uid) ?? [];
      assert.equal(matches.length, 1); assert.equal(matches[0].kind, assignment.kind); assert.equal(matches[0].suspicion, assignment.suspicion);
    }
    assert.equal(census.entries.length, assignments.length);
    report.status = 'source-private-census-complete-start-and-gameplay-pending';
    report.censusRevision = census.revision; report.intelligenceHolders = 1; report.wolfAgentHolders = 1; report.requiredCultHolders = 1;
    await save(context); return report;
  }
  return { onSetup, onBeforeStart };
}
