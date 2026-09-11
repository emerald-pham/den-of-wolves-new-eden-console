import { CONSOLE_ROLES } from './roles';
import { findShip } from './ships';
import type { RoleId, VesselId } from '@/types/identifiers';

export interface SeatMetadata {
  readonly label: string;
  readonly factionId: VesselId | null;
}

/** Client-side mirror of the server's canonical role-keyed seat catalog. */
export const ROLE_SEAT_METADATA: Readonly<Record<RoleId, SeatMetadata>> = Object.fromEntries(
  CONSOLE_ROLES.map((role) => {
    const factionId = role.shipId === 'press' ? 'press' : role.shipId;
    const factionLabel = role.shipId === 'press'
      ? 'SNN'
      : role.shipId === 'joint-engineering-union'
        ? 'Joint Engineering Union'
        : findShip(role.shipId)?.name ?? role.shipId;
    return [role.id, {
      label: `${factionLabel} // ${role.name}`,
      factionId,
    }];
  }),
);
