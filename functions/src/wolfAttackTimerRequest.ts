import { HttpsError } from 'firebase-functions/v2/https';
import { requireEmergencyTimerPauseRequest, requireVesselActionRequest } from './requestGuards';

type EmergencyTimerPauseRequest = Parameters<typeof requireEmergencyTimerPauseRequest>[0];
type AttackAwareEmergencyTimerPauseRequest = EmergencyTimerPauseRequest & {
  requestId?: unknown;
  expectedAttackRevision?: unknown;
  reason?: unknown;
  dangerConfirmed?: unknown;
};

/** Scoped attack recovery extends the ordinary clock contract at its only consumer. */
export function requireAttackAwareEmergencyTimerPauseRequest(data: AttackAwareEmergencyTimerPauseRequest):
  ReturnType<typeof requireEmergencyTimerPauseRequest> & {
    requestId?: string;
    expectedAttackRevision?: number;
    reason?: string;
    dangerConfirmed?: true;
  } {
  const ordinary = requireEmergencyTimerPauseRequest(data);
  const hasAttackIntervention = data.requestId !== undefined || data.expectedAttackRevision !== undefined ||
    data.reason !== undefined || data.dangerConfirmed !== undefined;
  if (!hasAttackIntervention) return ordinary;

  const { requestId } = requireVesselActionRequest({ requestId: data.requestId });
  if (!Number.isSafeInteger(data.expectedAttackRevision) || (data.expectedAttackRevision as number) < 1) {
    throw new HttpsError('invalid-argument', 'expectedAttackRevision must be a positive integer.');
  }
  const reason = typeof data.reason === 'string' ? data.reason : '';
  if (reason !== reason.trim() || reason.length < 8 || reason.length > 400) {
    throw new HttpsError('invalid-argument', 'An 8–400 character attack-intervention reason is required.');
  }
  if (data.dangerConfirmed !== true) {
    throw new HttpsError('invalid-argument', 'Confirm the attack-intervention risk before changing the shared clock.');
  }
  return {
    ...ordinary,
    requestId,
    expectedAttackRevision: data.expectedAttackRevision as number,
    reason,
    dangerConfirmed: true,
  };
}
