import { expect, it } from 'vitest';

import type { NavigationState } from './navigationProjection';
import {
  activateEndeavourEcmDevice,
  parseEndeavourEcmDeviceState,
} from './endeavourEcmDevice';

const navigation = (pursuitGroups: Readonly<Record<string, number>>): NavigationState => ({
  shipGalacticCoordinates: { shepherd: '0000', dione: '5143' },
  shipNavigationLogs: { shepherd: [], dione: [] },
  pursuitGroups,
});

const groups = [
  { id: 'fleet-1', vesselIds: ['shepherd'], memberUids: ['scientist'] },
  { id: 'fleet-2', vesselIds: ['dione'], memberUids: ['captain'] },
];

it('activates a completed ECM Device once and reduces only Shepherd’s group pursuit by three', () => {
  const result = activateEndeavourEcmDevice({
    progress: { 'ecm-device': 5 },
    state: undefined,
    expectedRevision: 0,
    navigation: navigation({ 'fleet-1': 8, 'fleet-2': 9 }),
    fleetGroups: groups,
  });

  expect(result.navigation.pursuitGroups).toEqual({ 'fleet-1': 5, 'fleet-2': 9 });
  expect(result.state).toEqual({
    status: 'used', revision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
  });
});

it('bounds the fixed reduction at zero without changing another group', () => {
  const result = activateEndeavourEcmDevice({
    progress: { 'ecm-device': 5 }, state: { status: 'ready', revision: 0 }, expectedRevision: 0,
    navigation: navigation({ 'fleet-1': 2, 'fleet-2': 7 }), fleetGroups: groups,
  });

  expect(result.navigation.pursuitGroups).toEqual({ 'fleet-1': 0, 'fleet-2': 7 });
  expect(result.state).toMatchObject({ pursuitBefore: 2, pursuitAfter: 0 });
});

it('rejects incomplete research, stale revisions, and a second activation', () => {
  const input = {
    progress: { 'ecm-device': 4 }, state: undefined, expectedRevision: 0,
    navigation: navigation({ 'fleet-1': 8, 'fleet-2': 9 }), fleetGroups: groups,
  };
  expect(() => activateEndeavourEcmDevice(input)).toThrow(/research.*complete/i);
  expect(() => activateEndeavourEcmDevice({
    ...input, progress: { 'ecm-device': 5 }, expectedRevision: 1,
  })).toThrow(/changed/i);
  expect(() => activateEndeavourEcmDevice({
    ...input,
    progress: { 'ecm-device': 5 },
    state: {
      status: 'used', revision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
    },
    expectedRevision: 1,
  })).toThrow(/already been used/i);
});

it('fails closed when Shepherd ownership or pursuit authority is ambiguous or malformed', () => {
  const base = {
    progress: { 'ecm-device': 5 }, state: undefined, expectedRevision: 0,
    navigation: navigation({ 'fleet-1': 8, 'fleet-2': 9 }), fleetGroups: groups,
  };
  expect(() => activateEndeavourEcmDevice({
    ...base,
    fleetGroups: [...groups, { id: 'fleet-3', vesselIds: ['shepherd'], memberUids: ['other'] }],
    navigation: navigation({ 'fleet-1': 8, 'fleet-2': 9, 'fleet-3': 4 }),
  })).toThrow(/exactly one fleet group/i);
  expect(() => activateEndeavourEcmDevice({
    ...base, navigation: navigation({ 'fleet-1': 8 }),
  })).toThrow(/pursuit authority/i);
  expect(() => activateEndeavourEcmDevice({
    ...base, navigation: navigation({ 'fleet-1': 8, 'fleet-2': 11 }),
  })).toThrow(/pursuit authority/i);
});

it('parses only reachable one-shot device states', () => {
  expect(parseEndeavourEcmDeviceState(undefined)).toEqual({ status: 'ready', revision: 0 });
  expect(parseEndeavourEcmDeviceState({ status: 'ready', revision: 0 }))
    .toEqual({ status: 'ready', revision: 0 });
  expect(parseEndeavourEcmDeviceState({
    status: 'used', revision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
  })).toEqual({
    status: 'used', revision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
  });
  expect(parseEndeavourEcmDeviceState({ status: 'ready', revision: 1 })).toBeNull();
  expect(parseEndeavourEcmDeviceState({
    status: 'used', revision: 2, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
  })).toBeNull();
  expect(parseEndeavourEcmDeviceState({
    status: 'used', revision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 2, pursuitAfter: 1,
  })).toBeNull();
});
