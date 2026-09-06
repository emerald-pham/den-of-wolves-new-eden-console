import { ROLE_IDS } from './roleConfiguration';

export function shipForRole(roleId: unknown): string | undefined {
  if (typeof roleId !== 'string' || !ROLE_IDS.some(id => id === roleId)) return undefined;
  if (['admiral', 'executive-officer', 'wing-commander'].includes(roleId)) return 'aegis';
  if (roleId === 'press-officer' || roleId.startsWith('joint-engineering-')) return undefined;
  return roleId.startsWith('refinery-124-') ? 'refinery-124' : roleId.split('-')[0];
}

export function canOperateRole(ownRole: unknown, targetRole: string, connectedRoles: readonly unknown[]): boolean {
  const ship = shipForRole(targetRole);
  if (!ship || shipForRole(ownRole) !== ship) return false;
  return ownRole === targetRole || !ROLE_IDS.filter(id => shipForRole(id) === ship)
    .every(id => connectedRoles.includes(id));
}
