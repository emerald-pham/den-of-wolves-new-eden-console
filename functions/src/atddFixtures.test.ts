import { describe, expect, it } from 'vitest';
import {
  callableFixture,
  clockFixture,
  configurationFixture,
  memberFixture,
  privateReaderFixture,
  randomFixture,
  roleFixture,
  snapshotFixture,
  shuttleFixture,
  vesselFixture,
} from './atddFixtures';

describe('deterministic ATDD fixtures', () => {
  it('uses explicit stable member, role, vessel, and shuttle identities', () => {
    expect(memberFixture()).toMatchObject({ uid: 'member-1', deviceId: 'device-1' });
    expect(roleFixture()).toMatchObject({ roleId: 'admiral', vesselId: 'aegis' });
    expect(vesselFixture()).toMatchObject({ vesselId: 'aegis', population: 1_000 });
    expect(shuttleFixture({ shuttleId: 'wobbly', sheetName: 'Condor' })).toMatchObject({
      shuttleId: 'wobbly', sheetName: 'Condor',
    });
  });

  it('makes time, configuration, readers, and requests explicit', () => {
    expect(clockFixture()).toMatchObject({ now: '2026-09-07T12:00:00.000Z', phase: 'active' });
    expect(configurationFixture()).toMatchObject({ playerCount: 8, dioneEnabled: false });
    expect(privateReaderFixture({ facilitator: true })).toMatchObject({ facilitator: true });
    expect(callableFixture({ requestId: 'retry-1', expectedRevision: 3 })).toEqual({
      uid: 'member-1', requestId: 'retry-1', expectedRevision: 3,
    });
  });

  it('fails closed when a scripted random source is exhausted', () => {
    const random = randomFixture([0.1]);
    expect(random.next()).toBe(0.1);
    expect(() => random.next()).toThrow(/exhausted/i);
  });

  it('keeps missing snapshots distinct from empty authoritative documents', () => {
    expect(snapshotFixture({}, false)).toEqual({ exists: false, data: {} });
    expect(snapshotFixture({ phase: 'active' })).toEqual({ exists: true, data: { phase: 'active' } });
  });

  it('allows fixtures to model hostile composition cases without bypassing policy', () => {
    expect(vesselFixture({ variant: 'capybara', vesselId: 'capybara' })).toMatchObject({
      variant: 'capybara', vesselId: 'capybara',
    });
    expect(privateReaderFixture({ uid: 'other', facilitator: false }).uid).toBe('other');
  });
});
