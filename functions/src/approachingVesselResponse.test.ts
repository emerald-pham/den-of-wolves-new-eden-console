import { describe, expect, it } from 'vitest';
import {
  APPROACHING_VESSEL_COORDINATION_ACTIONS,
  APPROACHING_VESSEL_RESPONSE_CHOICES,
  parseApproachingVesselResponseInput,
  publicApproachingVesselResponse,
} from './approachingVesselResponse';

const base = {
  vesselReality: 'real',
  responseChoices: ['wait-briefly-then-leave'],
  coordinationActions: ['medical', 'quarantine'],
  responseInstructions: 'Medical and security teams stage at the airlock; hold the fleet response until the next Team review.',
  quarantineInstructions: 'Medical assigns one monitor at the airlock and reports symptoms to the facilitator.',
  rationale: 'The pilot evidence is credible, but the fleet needs time to prepare.',
};

describe('Approaching Vessel adjudication', () => {
  it('records one or more printed response choices and separately bounded coordination instructions', () => {
    expect(parseApproachingVesselResponseInput(base)).toEqual({
      ...base,
      responseChoices: ['wait-briefly-then-leave'],
      coordinationActions: ['medical', 'quarantine'],
    });
    expect(APPROACHING_VESSEL_RESPONSE_CHOICES).toHaveLength(4);
    expect(APPROACHING_VESSEL_COORDINATION_ACTIONS).toEqual([
      'security', 'medical', 'research', 'quarantine', 'contingency-objectives',
    ]);
  });

  it('requires explicit truth adjudication, a response instruction, and operational details for selected plans', () => {
    expect(() => parseApproachingVesselResponseInput({ ...base, vesselReality: undefined })).toThrow();
    expect(() => parseApproachingVesselResponseInput({ ...base, responseChoices: [] })).toThrow();
    expect(() => parseApproachingVesselResponseInput({ ...base, responseInstructions: ' ' })).toThrow();
    expect(() => parseApproachingVesselResponseInput({ ...base, coordinationActions: ['quarantine'], quarantineInstructions: '' })).toThrow();
    expect(() => parseApproachingVesselResponseInput({ ...base, coordinationActions: ['contingency-objectives'] })).toThrow();
    expect(() => parseApproachingVesselResponseInput({ ...base, responseChoices: ['invented-mechanic'] })).toThrow();
  });

  it('publishes selected instructions and choices while stripping vessel truth and facilitator rationale', () => {
    const input = parseApproachingVesselResponseInput(base);
    const result = publicApproachingVesselResponse({
      type: 'approaching-vessel-response', sessionId: 's1', crisisId: 'vessel-1',
      crisisRevision: 4, revision: 1, state: 'debated', actorUid: 'gm-secret',
      instanceId: 'gm-instance-secret', ...input,
    });
    expect(result).toMatchObject({
      crisisId: 'vessel-1', responseChoices: ['wait-briefly-then-leave'],
      coordinationActions: ['medical', 'quarantine'], responseInstructions: input.responseInstructions,
    });
    expect(result).not.toHaveProperty('vesselReality');
    expect(result).not.toHaveProperty('rationale');
    expect(result).not.toHaveProperty('actorUid');
    expect(JSON.stringify(result)).not.toContain('gm-secret');
  });
});
