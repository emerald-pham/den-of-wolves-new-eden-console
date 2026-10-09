// Keep the browser's clean URL while selecting the separate HTML entry.
export function castingCompanionRoutePlugin() {
  const configure = ({ middlewares }) => {
    middlewares.use((request, response, next) => {
      const url = request.url ?? '';
      const queryIndex = url.indexOf('?');
      const path = queryIndex < 0 ? url : url.slice(0, queryIndex);
      if ((request.method === 'GET' || request.method === 'HEAD') && (path === '/casting' || path === '/casting/')) {
        request.url = '/casting/index.html' + (queryIndex < 0 ? '' : url.slice(queryIndex));
        // Vite's HTML sender writes no-cache downstream. Enforce this request's
        // policy through the final sender without changing unrelated routes.
        const setHeader = response.setHeader.bind(response);
        const policy = new Map([['cache-control', 'no-store'], ['referrer-policy', 'no-referrer'], ['x-robots-tag', 'noindex, nofollow, noarchive']]);
        response.setHeader = (name, value) => setHeader(name, policy.get(name.toLowerCase()) ?? value);
        response.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Cache-Control', 'no-store');
      }
      next();
    });
  };
  return { name: 'casting-companion-entry-route', apply: 'serve', configureServer: configure, configurePreviewServer: configure };
}
