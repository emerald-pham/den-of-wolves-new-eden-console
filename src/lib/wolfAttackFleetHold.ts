import type { WolfAttackMemberView } from '@/types/game';

/**
 * Whether the member-visible Wolf attack still holds the fleet. This mirrors
 * the server's `wolfAttackBlocksNormalMovement`: any attack record blocks
 * until it is resolved and normal movement reopens, whatever cycle declared
 * it. Members only see the resolved/finished step, which the server writes in
 * the same commit that unlocks airspace. The server remains the authority.
 */
export function wolfAttackHoldsFleet(view: Pick<WolfAttackMemberView, 'status' | 'currentStep'> | null): boolean {
  return view !== null && (view.status !== 'resolved' || view.currentStep !== 'resolved');
}
