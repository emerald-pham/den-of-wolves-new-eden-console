import { beforeEach, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/store/useSessionStore';
vi.mock('firebase/auth', () => ({signInAnonymously: vi.fn()}));
vi.mock('firebase/functions', () => ({httpsCallable: vi.fn()}));
vi.mock('./firebase', () => ({auth: () => ({currentUser: {uid: 'u1'}}), functions: () => 'functions'}));
const {httpsCallable} = await import('firebase/functions');
const {getWolfRangeSupportActionChoice, commitWolfRangeSupportActionChoice} = await import('./sessionService');
const source = 'vulcan-laser-cannon' as never;
const view = {type:'wolf-range-support-action-choice-view', sessionId:'s1', attackId:'a1', turn:3, revision:4,
  range:'medium-range', sourceId: source, actorRoleId:'vulcan-captain', choiceStatus:'pending',
  eligible:true, actionAvailable:true, deadlineAt:'2099-10-05T00:00:00.000Z', contacts:[]};
beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({id:'s1', name:'Fleet', joinCode:'1234', phase:'active', createdAt:'', updatedAt:''},
    {uid:'u1', sessionId:'s1', displayName:'Captain', role:'player', seatId:null, activeConsoleRoleId:null,
      replacementRoleId:'vulcan-captain', fleetGroupId:'fleet-1', joinedAt:''});
  useSessionStore.getState().setSession({...useSessionStore.getState().session!,
    smallShipStates: {vulcan: {id:'vulcan',hostShipId:'aegis',dockingRevision:1,population:15000,unrest:0,
      cycle:{step:0,revision:5,turn:3,results:{},charges:['laser-cannon']}}}});
  useSessionStore.getState().setConnection('live');
  useSessionStore.getState().setSessionSnapshotFreshness('server');
  vi.mocked(httpsCallable).mockReset();
});
it('reads the ordinary current Vulcan Captain view and commits only its explicit use/pass selection', async () => {
  const call = vi.fn().mockImplementation((payload) => Promise.resolve({data: payload.requestId
    ? {status:'committed',type:'wolf-range-support-action-choice',sessionId:'s1',requestId:payload.requestId,
      attackId:'a1',turn:3,revision:5,range:'medium-range',sourceId:source,choiceStatus:'passed',actionCount:0} : view}));
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  await expect(getWolfRangeSupportActionChoice('medium-range',source)).resolves.toEqual(view);
  await expect(commitWolfRangeSupportActionChoice(3,4,'medium-range',source,false)).resolves.toMatchObject({choiceStatus:'passed'});
  expect(call).toHaveBeenLastCalledWith(expect.objectContaining({sourceId:source,use:false,expectedTurn:3,expectedRevision:4}));
});
it('rejects foreign replacement and unprinted Long Range before any callable', async () => {
  await expect(getWolfRangeSupportActionChoice('long-range',source)).rejects.toThrow(/range/i);
  useSessionStore.getState().setMe({...useSessionStore.getState().me!,replacementRoleId:'gorgoneion-captain'});
  await expect(getWolfRangeSupportActionChoice('medium-range',source)).rejects.toThrow(/support actor/i);
  expect(httpsCallable).not.toHaveBeenCalled();
});
it.each(['revocation','dock','UID'] as const)('rejects a delayed private view after %s changes', async kind => {
  let finish!: (value: unknown) => void;
  const call = vi.fn(() => new Promise(done => {finish = done;}));
  vi.mocked(httpsCallable).mockReturnValue(call as never);
  const reading = getWolfRangeSupportActionChoice('medium-range',source);
  await vi.waitFor(() => expect(call).toHaveBeenCalled());
  if(kind==='dock') {
    const s=useSessionStore.getState().session!;
    useSessionStore.getState().setSession({...s,smallShipStates:{vulcan:{...s.smallShipStates!.vulcan!,dockingRevision:2}}});
  } else useSessionStore.getState().setMe({...useSessionStore.getState().me!, ...(kind==='UID'?{uid:'foreign'}:{replacementRoleId:null})});
  finish({data:view});
  await expect(reading).rejects.toThrow(/authority changed/i);
});
