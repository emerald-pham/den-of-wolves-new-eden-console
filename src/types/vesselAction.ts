import type { SessionPhase } from './game';

/** Server-authored metadata shared by vessel-console callable results. */
export interface VesselActionEnvelope {
  readonly actorUid: string;
  readonly actorRoleId: string | null;
  readonly vesselId: string;
  readonly hostShipId?: string;
  readonly turn: number;
  readonly phase: SessionPhase;
  readonly revision: number;
  readonly idempotencyKey: string;
  readonly auditId: string;
}
