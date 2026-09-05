import { findConsoleRole } from '@/data/roles';

export function consoleRoleRoute(roleId: string): string {
  const role = findConsoleRole(roleId);
  if (!role) return '/console';
  if (role.shipId === 'press') return '/press';
  if (role.shipId === 'joint-engineering-union') return `/union/roles/${role.id}`;
  return `/ships/${role.shipId}/roles/${role.id}`;
}
