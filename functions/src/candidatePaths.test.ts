import { describe, expect, it } from 'vitest';
import {
  candidateWorkspace, parseCandidateAction, parseCandidateState, resolveCandidateAction,
  type CandidateAuthority, type CandidateAction, type CandidateState,
} from './candidatePaths';

const now = '2026-10-05T12:00:00.000Z';
const authority = (code: 'N' | 'O' | 'P' = 'N'): CandidateAuthority => ({
  sessionId: 's1', cycle: 6, phase: 'active', coordination: true, now,
  groupId: 'fleet-1', vesselIds: ['aegis', 'shepherd', 'quellon', 'dione', 'icebreaker', 'refinery-124'],
  actor: { uid: 'u1', gm: false, shipIds: ['aegis'], research: true, shuttleIds: ['philia'] },
  discovered: [{ code, coordinate: '6798' }],
  ships: Object.fromEntries(['aegis', 'shepherd', 'quellon', 'dione', 'icebreaker', 'refinery-124']
    .map((shipId, i) => [shipId, { fuel: 6, materials: 10, reactorCapacity: i === 0 ? 5 : 4,
      destroyed: false, jumpCharged: true, jumpDamaged: false, longJumpCost: 3,
      atCandidate: true, jumpedThisCycle: false }])),
  research: { reactor: 4, 'jump-drive': 4, hydroponics: 4, 'water-reclamation': 4, 'fuel-refinery': 4 },
  engineeringShuttles: [{ id: 'philia', available: true }],
  hiddenScoutCount: 2,
  station: { coordinate: '6798', groupId: 'fleet-1', liberated: true, sourceId: 'wolf-final-1' },
});
const empty = (): CandidateState => ({ revision: 0, sites: {} });
const command = (action: CandidateAction['action'], extra: Record<string, unknown> = {}) =>
  parseCandidateAction({ sessionId: 's1', requestId: 'r1', expectedRevision: 0,
    expectedGroupId: 'fleet-1', code: action === 'nebula-jump' ? 'O' : action === 'contribute-reactor' ? 'P' : 'N',
    coordinate: '6798', action, ...extra });

describe('candidate source calculations and explicit choices', () => {
  it('fails closed when a stored public ship result contains private calculation fields', () => {
    const a = authority('O');
    const committed = resolveCandidateAction(a, empty(), command('nebula-jump', { shipId: 'aegis' }), 1);
    const poisoned = structuredClone(committed.state);
    Object.assign(poisoned.sites['6798']!.ships.aegis!, { scouts: 7, total: 8 });
    expect(() => parseCandidateState(poisoned)).toThrow(/malformed|result|private/i);
  });
  it('reports each distinct Ring blocker without exposing other candidate locations', () => {
    const view = candidateWorkspace(authority(), empty());
    expect(view.paths[0]).toMatchObject({ code: 'N', materials: 0, materialsRequired: 10,
      researchRequired: 5, researchCount: 0, shuttleCommitted: false, repaired: false });
    expect(view.paths[0]?.blockers).toEqual(expect.arrayContaining([
      'Contribute 10 materials.', 'Commit five distinct research tracks with at least four crosses.',
      'Commit one available Engineering Shuttle.',
    ]));
    expect(JSON.stringify(view)).not.toMatch(/hiddenScoutCount|wolfRoster|chartId/);
  });
  it('defaults legacy candidate state to Home and locks edition globally after another group starts N or O', () => {
    expect(parseCandidateState({ revision: 0, sites: {} })).toMatchObject({ edition: 'home' });
    const otherGroupStarted = parseCandidateState({ revision: 1, sites: { 'fleet-2:0408': {
      code: 'O', coordinate: '0408', groupId: 'fleet-2', materials: 0, researchIds: [], ships: {}, reactors: {},
    } } });
    expect(candidateWorkspace(authority('O'), otherGroupStarted)).toMatchObject({ edition: 'home', editionLocked: true });
  });
  it('accepts a Deluxe 15-material contribution and names the selected source edition', () => {
    const rawCommand: CandidateAction = { sessionId: 's1', requestId: 'deluxe-materials', expectedRevision: 0,
      expectedGroupId: 'fleet-1', code: 'N', coordinate: '6798', action: 'contribute-materials',
      shipId: 'aegis', amount: 15 };
    expect(() => parseCandidateAction(rawCommand)).not.toThrow();
    const base = authority();
    const a = { ...base, ships: { ...base.ships, aegis: { ...base.ships.aegis!, materials: 15 } } };
    const deluxeState = parseCandidateState({ revision: 0, edition: 'deluxe', sites: {} });
    const result = resolveCandidateAction(a, deluxeState, parseCandidateAction(rawCommand));
    expect(result.state.sites['6798']?.materials).toBe(15);
    expect(result.calculation.source).toBe('deluxe-v1.1-candidate-N');
  });
  it('requires fully completed Endeavour technologies for Deluxe Ring repair', () => {
    const base = authority();
    const a = { ...base, research: { ...base.research, 'fuel-refinery': 4 } };
    const deluxeState = parseCandidateState({ revision: 0, edition: 'deluxe', sites: {} });
    expect(() => resolveCandidateAction(a, deluxeState, command('contribute-research', {
      trackIds: ['reactor', 'jump-drive', 'hydroponics', 'water-reclamation', 'fuel-refinery'],
    }))).toThrow(/complete/i);
    const view = candidateWorkspace(a, deluxeState);
    expect(view.paths[0]?.researchChoices.map(choice => choice.id)).not.toContain('fuel-refinery');
  });
  it('does not treat a track with more crosses than its catalogued final box as completed', () => {
    const base = authority();
    const a = { ...base, research: { reactor: 6, 'jump-drive': 5, hydroponics: 5,
      'water-reclamation': 5, 'fuel-refinery': 5 } };
    const deluxeState = parseCandidateState({ revision: 0, edition: 'deluxe', sites: {} });
    expect(() => resolveCandidateAction(a, deluxeState, command('contribute-research', {
      trackIds: ['reactor', 'jump-drive', 'hydroponics', 'water-reclamation', 'fuel-refinery'],
    }))).toThrow(/complete/i);
    expect(candidateWorkspace(a, deluxeState).paths[0]?.researchChoices.map(choice => choice.id)).not.toContain('reactor');
  });
  it.each(['roll', 'dice', 'hiddenScoutCount', 'modifier', 'outcome', 'wolfRoster'])('rejects client-owned %s', field => {
    expect(() => command('nebula-jump', { shipId: 'aegis', [field]: 6 })).toThrow();
  });
  it('keeps edition selection out of per-action requests', () => {
    expect(() => parseCandidateAction({ sessionId: 's1', requestId: 'r1', expectedRevision: 0,
      expectedGroupId: 'fleet-1', code: 'N', coordinate: '6798', action: 'contribute-materials',
      shipId: 'aegis', amount: 1, edition: 'deluxe' })).toThrow();
  });
  it('deducts materials once and never accepts overfunding or a foreign ship', () => {
    const a = authority();
    const result = resolveCandidateAction(a, empty(), command('contribute-materials', { shipId: 'aegis', amount: 10 }));
    expect(result.shipPatches.aegis).toEqual({ materials: 0 });
    expect(result.state.sites['6798']?.materials).toBe(10);
    expect(() => resolveCandidateAction(a, result.state, command('contribute-materials',
      { requestId: 'r2', expectedRevision: 1, shipId: 'aegis', amount: 1 }))).toThrow(/materials|funded/i);
    expect(() => resolveCandidateAction(a, empty(), command('contribute-materials',
      { shipId: 'shepherd', amount: 1 }))).toThrow(/authority/i);
  });
  it('requires distinct four-cross lab tracks and completes repair automatically when the last requirement commits', () => {
    const a = authority();
    let state = resolveCandidateAction(a, empty(), command('contribute-materials', { shipId: 'aegis', amount: 10 })).state;
    expect(() => resolveCandidateAction(a, state, command('contribute-research', {
      expectedRevision: 1, trackIds: ['reactor', 'reactor'],
    }))).toThrow(/distinct|duplicate/i);
    state = resolveCandidateAction(a, state, command('contribute-research', {
      expectedRevision: 1, trackIds: Object.keys(a.research),
    })).state;
    expect(state.sites['6798']?.repairedAt).toBeUndefined();
    const last = resolveCandidateAction(a, state, command('commit-engineering-shuttle',
      { expectedRevision: 2, shuttleId: 'philia' }));
    expect(last.state.sites['6798']?.repairedAt).toBe(now);
    expect(last.reply.summary).toMatch(/repaired/i);
  });
  it('denies incomplete research, unavailable craft and a stale revision', () => {
    const a = authority();
    a.research.reactor = 3;
    expect(() => resolveCandidateAction(a, empty(), command('contribute-research', { trackIds: ['reactor'] }))).toThrow(/four/i);
    expect(() => resolveCandidateAction({ ...a, engineeringShuttles: [] }, empty(),
      command('commit-engineering-shuttle', { shuttleId: 'philia' }))).toThrow(/available/i);
    expect(() => resolveCandidateAction(a, empty(), command('contribute-materials',
      { expectedRevision: 1, shipId: 'aegis', amount: 1 }))).toThrow(/revision/i);
  });
  it('charges each Ring ship five fuel, retains an unfuelled ship and replays a crossed ship under a new request', () => {
    const a = authority();
    const state: CandidateState = { revision: 3, sites: { '6798': {
      code: 'N', coordinate: '6798', groupId: 'fleet-1', materials: 10,
      researchIds: Object.keys(a.research), shuttleId: 'philia', repairedAt: now, ships: {}, reactors: {},
    } } };
    const c = command('ring-passage', { expectedRevision: 3, shipId: 'aegis' });
    const result = resolveCandidateAction(a, state, c);
    expect(result.shipPatches.aegis).toMatchObject({ fuel: 1 });
    expect(result.reply).toMatchObject({ outcome: 'crossed', fuelSpent: 5 });
    const replay = resolveCandidateAction(a, result.state, { ...c, requestId: 'r2' });
    expect(replay.reply).toMatchObject({ status: 'replayed', requestId: 'r1', fuelSpent: 5 });
    expect(replay.shipPatches).toEqual({});
    const low = { ...a, ships: { ...a.ships, aegis: { ...a.ships.aegis!, fuel: 4 } } };
    expect(() => resolveCandidateAction(low, state, c)).toThrow(/five|fuel/i);
    expect(() => resolveCandidateAction(a, state, command('sabotage-ring', { expectedRevision: 3 }))).toThrow(/facilitator/i);
    const finish = resolveCandidateAction({ ...a, actor: { ...a.actor, gm: true } }, result.state,
      command('sabotage-ring', { expectedRevision: 4, requestId: 'close' }));
    expect(finish.groupOutcome).toMatchObject({ candidateCode: 'N', successfulShipIds: ['aegis'],
      leftBehindShipIds: ['shepherd', 'quellon', 'dione', 'icebreaker', 'refinery-124'] });
  });
  it('does not carry the Home far-side Wolf-stop choice into Deluxe Ring rules', () => {
    const base = authority();
    const gm = { ...base, actor: { ...base.actor, gm: true } };
    const state = { revision: 3, edition: 'deluxe', sites: { '6798': {
      code: 'N', coordinate: '6798', groupId: 'fleet-1', materials: 15,
      researchIds: Object.keys(base.research), shuttleId: 'philia', repairedAt: now,
      ships: { aegis: { type: 'candidate-action-result', status: 'committed', sessionId: 's1', requestId: 'crossed',
        revision: 1, code: 'N', action: 'ring-passage', summary: 'Ring passage committed.', outcome: 'crossed',
        fuelSpent: 5, remainingFuel: 1 } }, reactors: {},
    } } } as unknown as CandidateState;
    expect(candidateWorkspace(gm, state).paths[0]?.canSabotage).toBe(false);
    expect(() => resolveCandidateAction(gm, state,
      command('sabotage-ring', { expectedRevision: 3, requestId: 'deluxe-sabotage' }))).toThrow(/Home|edition|not available/i);
  });
  it('uses a server die plus hidden scouts, adds only prior losses and hides all arithmetic from the actor', () => {
    const a = authority('O');
    const c = command('nebula-jump', { shipId: 'aegis' });
    const lost = resolveCandidateAction(a, empty(), c, 6);
    expect(lost.reply).toMatchObject({ outcome: 'lost', fuelSpent: 3 });
    expect(lost.calculation).toMatchObject({ die: 6, scouts: 2, priorLosses: 0, total: 8, threshold: 9 });
    expect(lost.shipPatches.aegis).toMatchObject({ destroyed: true, survivors: 0 });
    expect(JSON.stringify(lost.reply)).not.toMatch(/die|scouts|priorLosses|total|threshold/);
    const next = resolveCandidateAction({ ...a, actor: { ...a.actor, shipIds: ['shepherd'] } }, lost.state,
      command('nebula-jump', { expectedRevision: 1, requestId: 'r2', shipId: 'shepherd' }), 6);
    expect(next.reply).toMatchObject({ outcome: 'reached' });
    expect(next.calculation).toMatchObject({ priorLosses: 1, total: 9 });
    expect(next.groupOutcome).toBeUndefined();
  });
  it('uses Deluxe threshold eight and gives no later-ship bonus for an earlier loss', () => {
    const base = authority('O');
    const deluxeState = parseCandidateState({ revision: 0, edition: 'deluxe', sites: {} });
    const first = resolveCandidateAction({ ...base, hiddenScoutCount: 0 }, deluxeState,
      command('nebula-jump', { shipId: 'aegis' }), 1);
    expect(first.reply.outcome).toBe('lost');
    const nextAuthority = { ...base, hiddenScoutCount: 1, actor: { ...base.actor, shipIds: ['shepherd'] } };
    const next = resolveCandidateAction(nextAuthority, first.state,
      command('nebula-jump', { expectedRevision: 1, requestId: 'deluxe-next', shipId: 'shepherd' }), 6);
    expect(next.reply.outcome).toBe('lost');
    expect(next.calculation).toMatchObject({ die: 6, scouts: 1, total: 7, threshold: 8 });
    expect(JSON.stringify(next.reply)).not.toMatch(/die|scouts|priorLosses|total|threshold/);
  });
  it('replays a lost or reached ship without another die or cost, and refuses an ordinary same-cycle jump', () => {
    const a = authority('O');
    const c = command('nebula-jump', { shipId: 'aegis' });
    const first = resolveCandidateAction(a, empty(), c, 1);
    const retry = resolveCandidateAction(a, first.state, { ...c, requestId: 'new-request' });
    expect(retry.reply).toMatchObject({ status: 'replayed', requestId: 'r1', outcome: 'lost' });
    expect(retry.shipPatches).toEqual({});
    expect(() => resolveCandidateAction({ ...a, ships: { ...a.ships,
      aegis: { ...a.ships.aegis!, jumpedThisCycle: true } } }, empty(), c, 6)).toThrow(/cycle/i);
  });
  it('records group success only after every ship disposition is decided', () => {
    const a = authority('O');
    a.hiddenScoutCount = 8;
    let state = empty();
    for (const [index, shipId] of a.vesselIds.entries()) {
      const result = resolveCandidateAction({ ...a, actor: { ...a.actor, shipIds: [shipId] } }, state,
        command('nebula-jump', { shipId, requestId: `r${index}`, expectedRevision: index }), 1);
      expect(result.groupOutcome !== undefined).toBe(index === a.vesselIds.length - 1);
      state = result.state;
    }
    expect(state.sites['6798']?.completed?.successfulShipIds).toEqual(a.vesselIds);
  });
  it('refuses Reactor contributions until authoritative liberation, ignores destroyed ships and counts unique available capacity', () => {
    const a = authority('P');
    expect(() => resolveCandidateAction({ ...a, station: { ...a.station!, liberated: false } }, empty(),
      command('contribute-reactor', { shipId: 'aegis' }))).toThrow(/liberated/i);
    const first = resolveCandidateAction(a, empty(), command('contribute-reactor', { shipId: 'aegis' }));
    expect(first.state.sites['6798']?.reactors.aegis).toBe(5);
    expect(first.shipPatches.aegis).toMatchObject({ cannibalised: true });
    expect(() => resolveCandidateAction(a, first.state, command('contribute-reactor',
      { requestId: 'new', expectedRevision: 1, shipId: 'aegis' }))).toThrow(/already|twice/i);
    expect(() => resolveCandidateAction({ ...a, ships: { ...a.ships,
      aegis: { ...a.ships.aegis!, destroyed: true } } }, empty(),
      command('contribute-reactor', { shipId: 'aegis' }))).toThrow(/lost|destroyed/i);
  });
  it('activates New Eden Station automatically at 18 capacity and preserves different ship choices', () => {
    const a = authority('P');
    let state = empty();
    for (const [index, shipId] of ['aegis', 'shepherd', 'quellon', 'dione', 'icebreaker'].entries()) {
      const result = resolveCandidateAction({ ...a, actor: { ...a.actor, shipIds: [shipId] } }, state,
        command('contribute-reactor', { shipId, requestId: `r${index}`, expectedRevision: index }));
      expect(result.groupOutcome !== undefined).toBe(index === 4);
      state = result.state;
    }
    expect(state.sites['6798']?.activatedAt).toBe(now);
    expect(state.sites['6798']?.completed).toMatchObject({ candidateCode: 'P', result: 'success' });
  });
  it('never authorizes an undiscovered candidate, a foreign group, or terminal new action', () => {
    const a = authority();
    const c = command('contribute-materials', { shipId: 'aegis', amount: 1 });
    expect(() => resolveCandidateAction({ ...a, discovered: [] }, empty(), c)).toThrow(/discovery/i);
    expect(() => resolveCandidateAction(a, empty(), { ...c, expectedGroupId: 'fleet-2' })).toThrow(/group/i);
    expect(() => resolveCandidateAction({ ...a, phase: 'debrief' }, empty(), c)).toThrow(/active|terminal/i);
  });
  it('keeps separate group choices at the same candidate while earlier Nebula losses help later attempts there', () => {
    const a = authority('O');
    const first = resolveCandidateAction(a, empty(), command('nebula-jump', { shipId: 'aegis' }), 6);
    const wing = { ...a, groupId: 'fleet-2', vesselIds: ['shepherd'],
      actor: { ...a.actor, shipIds: ['shepherd'] } };
    const second = resolveCandidateAction(wing, first.state, command('nebula-jump', {
      shipId: 'shepherd', requestId: 'wing-jump', expectedGroupId: 'fleet-2', expectedRevision: 1,
    }), 6);
    expect(second.reply.outcome).toBe('reached');
    expect(second.calculation).toMatchObject({ priorLosses: 1, total: 9 });
    expect(Object.values(second.state.sites).map(site => site.groupId).sort()).toEqual(['fleet-1', 'fleet-2']);
    const view = candidateWorkspace(wing, second.state);
    expect(view.paths[0]?.ships.map(ship => ship.shipId)).toEqual(['shepherd']);
    expect(JSON.stringify(view)).not.toMatch(/aegis|priorLosses|hiddenScoutCount/);
  });
});
