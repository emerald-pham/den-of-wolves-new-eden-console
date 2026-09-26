import { describe, expect, it } from 'vitest';
import { parsePdfEscortWingMemberView } from './pdfEscortWingProjection';

const initialView = {
  type: 'pdf-escort-fighter-wing-view',
  revision: 0,
  capacity: 4,
  fighters: 4,
  launched: false,
  mediumResolved: false,
  mediumActionCount: 0,
  shortResolved: false,
  shortRollCount: 0,
  losses: 0,
} as const;

describe('client PDF Escort Wing projection parser', () => {
  it('uses the registered four-fighter baseline when the server has not written state', () => {
    expect(parsePdfEscortWingMemberView(undefined)).toEqual(initialView);
  });

  it('accepts the explicit member-safe projection shape', () => {
    expect(parsePdfEscortWingMemberView({
      ...initialView,
      revision: 3,
      fighters: 2,
      launched: true,
      mediumResolved: true,
      mediumActionCount: 2,
      shortResolved: true,
      shortRollCount: 4,
      losses: 2,
    })).toEqual({
      ...initialView,
      revision: 3,
      fighters: 2,
      launched: true,
      mediumResolved: true,
      mediumActionCount: 2,
      shortResolved: true,
      shortRollCount: 4,
      losses: 2,
    });
  });

  it('rejects malformed or client-shaped state instead of surfacing unknown fields', () => {
    expect(parsePdfEscortWingMemberView({ ...initialView, extra: 'hidden data' })).toBeUndefined();
    expect(parsePdfEscortWingMemberView({ ...initialView, fighters: 3 })).toBeUndefined();
    expect(parsePdfEscortWingMemberView({ ...initialView, revision: -1 })).toBeUndefined();
  });
});
