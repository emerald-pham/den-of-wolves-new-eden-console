import { describe, expect, it } from 'vitest';
import {
  candidateWorkspace, parseCandidateAction, resolveCandidateAction,
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
  it.each(['roll', 'dice', 'hiddenScoutCount', 'modifier', 'outcome', 'wolfRoster'])('rejects client-owned %s', field => {
    expect(() => command('nebula-jump', { shipId: 'aegis', [field]: 6 })).toThrow();
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
