import { describe, expect, it } from 'vitest';
import {
  demoActorAppName,
  demoActorManagerUrl,
  demoActorProfileFromUrl,
  demoActorSessionStorageKey,
  demoActorUrl,
} from './demoActorContext';

describe('fixed-document demo actor context', () => {
  it('keeps the normal app and persisted store untouched', () => {
    expect(demoActorAppName(null)).toBe('[DEFAULT]');
    expect(demoActorSessionStorageKey('dow-new-eden-session', null)).toBe('dow-new-eden-session');
  });

  it('uses a separate app and store for each actor in each demo session', () => {
    const admiral = { sessionId: 'session-a', roleId: 'admiral' };
    const engineer = { sessionId: 'session-a', roleId: 'dione-engineer' };
    expect(demoActorAppName(admiral)).not.toBe(demoActorAppName(engineer));
    expect(demoActorSessionStorageKey('store', admiral)).not.toBe(demoActorSessionStorageKey('store', engineer));
    expect(demoActorAppName(admiral)).not.toBe(demoActorAppName({ ...admiral, sessionId: 'session-b' }));
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
});
