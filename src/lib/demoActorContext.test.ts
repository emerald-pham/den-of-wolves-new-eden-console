import { beforeEach, describe, expect, it } from 'vitest';
import {
  demoActorAppName,
  demoActorManagerUrl,
  demoActorProfileFromUrl,
  demoActorSessionStorageKey,
  demoActorUrl,
  readDemoActorAccountUid,
  rememberDemoActorAccount,
} from './demoActorContext';
beforeEach(() => { localStorage.clear(); });

describe('fixed-document demo actor context', () => {
  it('keeps the normal app and persisted store untouched', () => {
    expect(demoActorAppName(null)).toBe('[DEFAULT]');
    expect(demoActorSessionStorageKey('dow-new-eden-session', null)).toBe('dow-new-eden-session');
  });

  it('reuses real role accounts across fresh games while isolating every session outbox', () => {
    const admiral = { sessionId: 'session-a', roleId: 'admiral' };
    const engineer = { sessionId: 'session-a', roleId: 'dione-engineer' };
    expect(demoActorAppName(admiral)).not.toBe(demoActorAppName(engineer));
    expect(demoActorSessionStorageKey('store', admiral)).not.toBe(demoActorSessionStorageKey('store', engineer));
    expect(demoActorAppName(admiral)).toBe(demoActorAppName({ ...admiral, sessionId: 'session-b' }));
    expect(demoActorSessionStorageKey('store', admiral)).not.toBe(demoActorSessionStorageKey('store', { ...admiral, sessionId: 'session-b' }));
  });

  it('rejects malformed, unknown and ambiguous actor identifiers', () => {
    for (const value of ['', 'session~gm', 'session~unknown', 'session/other~admiral', 'session~admiral~other']) {
      expect(demoActorProfileFromUrl(`https://console.test/?demoActor=${encodeURIComponent(value)}`)).toBeNull();
    }
    expect(demoActorProfileFromUrl('https://console.test/?demoActor=s~admiral&demoActor=s~controller')).toBeNull();
  });

  it('creates a two-browser manager link with only ordinary admission data', () => {
    const url = demoActorManagerUrl({ id: 'session-a', joinCode: '482100' }, 'https://console.test/?password=remove&token=remove#/gm');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('demoActor')).toBe('session-a~controller');
    expect(parsed.searchParams.get('demoJoin')).toBe('482100');
    expect([...parsed.searchParams.keys()]).toEqual(['demoActor', 'demoJoin']);
    expect(parsed.hash).toBe('#/demo-actors');
    expect(demoActorProfileFromUrl(url)).toEqual({ sessionId: 'session-a', roleId: 'controller' });
  });

  it('switches by loading a new document at the ordinary actor manager route', () => {
    const url = demoActorUrl({ sessionId: 'session-a', roleId: 'admiral' }, '482100', 'https://console.test/app/?secret=remove#/ships/dione');
    expect(new URL(url).pathname).toBe('/app/');
    expect(new URL(url).hash).toBe('#/demo-actors');
    expect(demoActorProfileFromUrl(url)?.roleId).toBe('admiral');
    expect(url).not.toContain('secret');
  });

  it('records only public real-UID metadata and refuses to silently rebind a role account', () => {
    rememberDemoActorAccount({ sessionId: 'session-a', roleId: 'admiral' }, 'real-admiral');
    expect(readDemoActorAccountUid('admiral')).toBe('real-admiral');
    expect(() => rememberDemoActorAccount({ sessionId: 'session-b', roleId: 'admiral' }, 'replacement-uid')).toThrow(/identity/i);
    expect(JSON.stringify([...Array.from({ length: localStorage.length }, (_, i) => localStorage.getItem(localStorage.key(i)!))])).not.toMatch(/session-a|token|credential|password|secret/);
  });
});
