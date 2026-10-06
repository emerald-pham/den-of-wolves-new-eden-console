export const BASE_MISSION_ROLE_PRIORITY = Object.freeze([]);
export function baseShipForRole() { return undefined; }
export function baseShipRoleCandidates() { return []; }
export function assessLiveBaseAction() { return { status: 'pending', blockers: ['unimplemented'] }; }
export function chooseAvailableBaseShipRole() { return { status: 'pending', roleId: null, blockers: ['unimplemented'] }; }
export function selectBaseMissionTeam() { return { status: 'pending', participantRoleIds: [] }; }
export function validateBaseMissionStartReceipt() { throw new Error('unimplemented mission receipt'); }
