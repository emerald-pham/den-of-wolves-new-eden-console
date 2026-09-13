export function isInGameRoute(path: string): boolean {
  if (path === '/press') return true;
  if (/^\/union\/roles\/[^/]+$/.test(path)) return true;
  return /^\/ships\/[^/]+\/roles\/[^/]+$/.test(path);
}
