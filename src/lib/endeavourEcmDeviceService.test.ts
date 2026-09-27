import { expect, it } from 'vitest';
import {
  parseEndeavourEcmDeviceReply,
  parseEndeavourEcmDeviceWorkspace,
} from './endeavourEcmDeviceService';

const workspace = {
  status: 'ready',
  sessionId: 's1',
  cycle: 3,
  controlRevision: 4,
  researchComplete: true,
  device: { status: 'ready', revision: 0 },
  pursuit: { groupId: 'fleet-1', current: 8 },
};

const attempt = {
  sessionId: 's1', requestId: 'ecm-use-1', expectedControlRevision: 4,
  expectedDeviceRevision: 0, expectedCycle: 3,
};

it('accepts the exact private Scientist workspace and rejects malformed or cross-session authority', () => {
  expect(parseEndeavourEcmDeviceWorkspace(workspace, 's1')).toEqual(workspace);
  expect(parseEndeavourEcmDeviceWorkspace({ ...workspace, sessionId: 's2' }, 's1')).toBeNull();
  expect(parseEndeavourEcmDeviceWorkspace({ ...workspace, pursuit: { ...workspace.pursuit, groupId: 'group-alpha' } }, 's1'))
    .toBeNull();
  expect(parseEndeavourEcmDeviceWorkspace({ ...workspace, device: { status: 'ready', revision: 1 } }, 's1'))
    .toBeNull();
  expect(parseEndeavourEcmDeviceWorkspace({ ...workspace, extra: 'public pursuit map' }, 's1')).toBeNull();
});

it('accepts a committed or exact replay receipt only when its one-shot pursuit delta is exact', () => {
  const reply = {
    status: 'committed', sessionId: 's1', requestId: 'ecm-use-1', cycle: 3,
    deviceRevision: 1, ownerGroupId: 'fleet-1', pursuitBefore: 8, pursuitAfter: 5,
  };
  expect(parseEndeavourEcmDeviceReply(reply, attempt)).toEqual(reply);
  expect(parseEndeavourEcmDeviceReply({ ...reply, status: 'replayed' }, attempt))
    .toMatchObject({ status: 'replayed' });
  expect(parseEndeavourEcmDeviceReply({ ...reply, requestId: 'other' }, attempt)).toBeNull();
  expect(parseEndeavourEcmDeviceReply({ ...reply, pursuitAfter: 4 }, attempt)).toBeNull();
  expect(parseEndeavourEcmDeviceReply({ ...reply, ownerGroupId: 'group-alpha' }, attempt)).toBeNull();
  expect(parseEndeavourEcmDeviceReply({ ...reply, deviceRevision: 2 }, {
    ...attempt, expectedDeviceRevision: 1,
  })).toBeNull();
});

it('retains the original owner group in a spent device after Shepherd changes groups', () => {
  const used = {
    ...workspace,
    device: {
      status: 'used', revision: 1, ownerGroupId: 'fleet-1',
      pursuitBefore: 8, pursuitAfter: 5,
    },
    pursuit: { groupId: 'fleet-2', current: 7 },
  };
  expect(parseEndeavourEcmDeviceWorkspace(used, 's1')).toEqual(used);
});
