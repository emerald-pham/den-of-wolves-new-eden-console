const SESSION_ROUTES = new Set(['/roles', '/gm', '/console', '/press']);

/** Routes that can be restored only after the current session identity exists. */
export function isSessionRoute(path: string): boolean {
  return SESSION_ROUTES.has(path) ||
    path.startsWith('/ships/') ||
    path.startsWith('/union/') ||
    path.startsWith('/shuttles/');
}

/** Keep a persisted return path inside the authenticated route surface. */
export function restoreSessionRoute(lastRoute: string | null): string {
  return lastRoute && isSessionRoute(lastRoute) ? lastRoute : '/roles';
}
