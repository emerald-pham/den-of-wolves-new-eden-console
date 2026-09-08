import type { LifecyclePhase } from './lifecycle';
import type { SessionConfiguration } from './gameSetup';

export interface MemberFixture {
  readonly uid: string;
  readonly deviceId: string;
  readonly displayName: string;
  readonly connected: boolean;
  readonly role: 'player' | 'gm' | 'observer';
  readonly seatId: string | null;
  readonly assignedRoleId: string | null;
}

export function memberFixture(
  overrides: Partial<MemberFixture> = {},
): MemberFixture {
  return {
    uid: 'member-1',
    deviceId: 'device-1',
    displayName: 'Fixture Member',
    connected: true,
    role: 'player',
    seatId: null,
    assignedRoleId: null,
    ...overrides,
  };
}

export interface RoleFixture {
  readonly roleId: string;
  readonly vesselId: string | null;
  readonly active: boolean;
  readonly unionRoleId: string | null;
}

export function roleFixture(
  overrides: Partial<RoleFixture> = {},
): RoleFixture {
  return {
    roleId: 'admiral',
    vesselId: 'aegis',
    active: true,
    unionRoleId: null,
    ...overrides,
  };
}

export interface VesselFixture {
  readonly vesselId: string;
  readonly variant: 'base' | 'capybara' | 'none';
  readonly population: number;
  readonly resources: Readonly<Record<string, number>>;
  readonly securityTeams: number;
  readonly destroyed: boolean;
}

export function vesselFixture(
  overrides: Partial<VesselFixture> = {},
): VesselFixture {
  return {
    vesselId: 'aegis',
    variant: 'base',
    population: 1_000,
    resources: { ore: 0, fuel: 4, food: 8, water: 6, materials: 1 },
    securityTeams: 9,
    destroyed: false,
    ...overrides,
  };
}

export interface ShuttleFixture {
  readonly shuttleId: string;
  readonly sheetName: string;
  readonly holderUid: string | null;
  readonly hostVesselId: string | null;
  readonly capabilities: readonly string[];
}

export function shuttleFixture(
  overrides: Partial<ShuttleFixture> = {},
): ShuttleFixture {
  return {
    shuttleId: 'icn',
    sheetName: 'ICN',
    holderUid: null,
    hostVesselId: 'aegis',
    capabilities: ['transport'],
    ...overrides,
  };
}

export interface ClockFixture {
  readonly now: string;
  readonly turn: number;
  readonly phase: LifecyclePhase;
  readonly phaseRevision: number;
  readonly phaseStartedAt: string;
  readonly phaseEndsAt: string;
  readonly paused: boolean;
}

export function clockFixture(
  overrides: Partial<ClockFixture> = {},
): ClockFixture {
  return {
    now: '2026-09-07T12:00:00.000Z',
    turn: 1,
    phase: 'active',
    phaseRevision: 1,
    phaseStartedAt: '2026-09-07T11:55:00.000Z',
    phaseEndsAt: '2026-09-07T12:10:00.000Z',
    paused: false,
    ...overrides,
  };
}

export interface RandomFixture {
  readonly values: readonly number[];
  readonly next: () => number;
}

export function randomFixture(values: readonly number[] = [0.25]): RandomFixture {
  let index = 0;
  return {
    values: [...values],
    next: () => {
      const value = values[index];
      if (value === undefined) throw new Error('The fixture random sequence is exhausted.');
      index += 1;
      return value;
    },
  };
}

export interface SnapshotFixture {
  readonly exists: boolean;
  readonly data: Readonly<Record<string, unknown>>;
}

export function snapshotFixture(
  data: Readonly<Record<string, unknown>> = {},
  exists = true,
): SnapshotFixture {
  return { exists, data: { ...data } };
}

export interface PrivateReaderFixture {
  readonly uid: string;
  readonly roleId: string | null;
  readonly facilitator: boolean;
  readonly vesselId: string | null;
}

export function privateReaderFixture(
  overrides: Partial<PrivateReaderFixture> = {},
): PrivateReaderFixture {
  return {
    uid: 'member-1',
    roleId: 'admiral',
    facilitator: false,
    vesselId: 'aegis',
    ...overrides,
  };
}

export interface CallableFixture {
  readonly uid: string;
  readonly requestId: string;
  readonly expectedRevision: number;
}

export function callableFixture(
  overrides: Partial<CallableFixture> = {},
): CallableFixture {
  return {
    uid: 'member-1',
    requestId: 'request-1',
    expectedRevision: 0,
    ...overrides,
  };
}

export interface ConfigurationFixture extends SessionConfiguration {
  readonly setupRevision: number;
}

export function configurationFixture(
  overrides: Partial<ConfigurationFixture> = {},
): ConfigurationFixture {
  return {
    playerCount: 8,
    chartId: 'A',
    expansion: 'base',
    turnLimit: 8,
    dioneEnabled: false,
    capybaraEnabled: true,
    setupRevision: 0,
    ...overrides,
  };
}
