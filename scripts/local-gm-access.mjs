// Development server only. No endpoint is installed in build/preview or Hosting.
const loopbackNames = new Set(['127.0.0.1', 'localhost', '[::1]']);
const loopbackPeers = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
function port(value) {
  return typeof value === 'string' && /^\d+$/.test(value) && Number(value) > 0 && Number(value) <= 65535 ? Number(value) : null;
}
export function localGmAccessConfiguration(command, env) {
  const authPort = port(env.VITE_FIREBASE_AUTH_EMULATOR_PORT);
  const firestorePort = port(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT);
  if (command !== 'serve' || env.VITE_LOCAL_GM_ACCESS !== '1' || env.VITE_USE_EMULATORS !== '1' ||
      !/^demo-[a-z0-9-]+$/.test(env.VITE_FIREBASE_PROJECT_ID ?? '') || !authPort || !firestorePort) return null;
  return { projectId: env.VITE_FIREBASE_PROJECT_ID, authPort, firestorePort };
}
export async function grantLocalGmAccess(config, request, fetcher = fetch, now = () => new Date()) {
  if (!config || request.method !== 'POST' || !loopbackPeers.has(request.remoteAddress) ||
      typeof request.token !== 'string' || !request.token || request.token.length > 8192) throw Error('Local GM authorization rejected.');
  let origin;
  let host;
  try {
    origin = new URL(request.origin);
    host = new URL(`http://${request.host}`);
  } catch { throw Error('Local GM authorization rejected.'); }
  if (origin.protocol !== 'http:' || !loopbackNames.has(origin.hostname) ||
      !loopbackNames.has(host.hostname) || origin.host !== host.host) throw Error('Local GM authorization rejected.');
  // The emulator lookup remains authoritative for existence; this additional
  // audience/issuer check prevents an unrelated emulator project being seeded.
  let claims;
  try { claims = JSON.parse(Buffer.from(request.token.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw Error('Local emulator identity rejected.'); }
  if (claims.aud !== config.projectId || claims.iss !== `https://securetoken.google.com/${config.projectId}`) {
    throw Error('Local emulator identity rejected.');
  }
  const lookup = await fetcher(`http://127.0.0.1:${config.authPort}/identitytoolkit.googleapis.com/v1/accounts:lookup?key=${config.projectId}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: request.token }), signal: AbortSignal.timeout(5000),
  });
  if (!lookup.ok) throw Error('Local emulator identity rejected.');
  const identity = await lookup.json();
  const uid = identity.users?.length === 1 ? identity.users[0]?.localId : undefined;
  if (typeof uid !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) throw Error('Local emulator identity rejected.');
  const result = await fetcher(`http://127.0.0.1:${config.firestorePort}/v1/projects/${config.projectId}/databases/(default)/documents/gmAccess/${uid}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { uid: { stringValue: uid }, authenticatedAt: { timestampValue: now().toISOString() } } }), signal: AbortSignal.timeout(5000),
  });
  if (!result.ok) throw Error('Local GM lease could not be saved.');
  return { authenticated: true };
}
export function localGmAccessPlugin(config) {
  return {
    name: 'local-emulator-gm-access', apply: 'serve',
    configureServer(server) {
      if (!config) return;
      server.middlewares.use('/__local-gm-access', async (request, response) => {
        try {
          // Bound the token body before parsing; never log it or the identity.
          let body = '';
          for await (const chunk of request) {
            body += chunk;
            if (body.length > 10000) throw Error('Request too large.');
          }
          const result = await grantLocalGmAccess(config, {
            method: request.method, origin: request.headers.origin, host: request.headers.host,
            remoteAddress: request.socket.remoteAddress, token: JSON.parse(body).idToken,
          });
          response.setHeader('Content-Type', 'application/json');
          response.setHeader('Cache-Control', 'no-store');
          response.end(JSON.stringify(result));
        } catch {
          response.statusCode = 403;
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify({ error: 'Local GM authorization failed. Check the demo emulators and local configuration.' }));
        }
      });
    },
  };
}
