// Small shared helpers for the PC10.3 real-browser recovery proofs
// (test-pc10-3-station-loss, -role-reassignment, -mission-attack-reconnect).
// Read-only views of one browser member opened by
// scripts/pc10-3-reconnect-harness.mjs; nothing here writes session state.
import { setTimeout as delay } from 'node:timers/promises';

export const STATION_LOSS_NOTICE =
  'Your previous station is no longer available. Return to station select and reselect your role.';
export const QUEUED_NOT_COMPLETED =
  'A queued action from before the change was not completed. Review the live state before retrying.';

const SESSION_STORAGE_KEY = 'dow-new-eden-session';

/** The persisted outbox this browser would replay after a reload. */
export function pendingCommands(page) {
  return page.evaluate(key => JSON.parse(window.localStorage.getItem(key) ?? '{}').state?.pendingCommands ?? [], SESSION_STORAGE_KEY);
}

const trackedModules = new WeakMap();
/**
 * Remember the exact URL the app loaded each `/src/...` module from, so a
 * page-side import reaches the same module instance (Vite may add `?t=`).
 * Call before the member's first navigation.
 */
export function trackAppModules(member) {
  const urls = new Map();
  trackedModules.set(member, urls);
  member.page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/src/')) urls.set(url.pathname, url.href);
  });
}

export function appModule(member, path) {
  return trackedModules.get(member)?.get(path) ?? path;
}

/** Poll an async condition; return its truthy value or throw with the description. */
export async function pollUntil(description, ready, timeout = 60_000, interval = 250) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await ready();
    if (last) return last;
    await delay(interval);
  }
  throw new Error(`Timed out: ${description}`);
}

/** The communication notice held in the app store (what the alert should render). */
export function storedNotice(member) {
  return member.page.evaluate(async moduleUrl => {
    const { useSessionStore } = await import(moduleUrl);
    const notice = useSessionStore.getState().communicationError;
    return notice ? JSON.parse(JSON.stringify(notice)) : null;
  }, appModule(member, '/src/store/useSessionStore.ts'));
}

/** Record each resumeSession reply's station signal (no identity or session body). */
export function watchResumes(member, replies) {
  member.page.on('response', async response => {
    if (!new URL(response.url()).pathname.endsWith('/resumeSession')) return;
    const body = await response.json().catch(() => null);
    replies.push({ at: Date.now(), httpStatus: response.status(),
      stationSelectionRequired: body?.result?.stationSelectionRequired ?? null,
      seatId: body?.result?.player?.seatId ?? null, activeConsoleRoleId: body?.result?.player?.activeConsoleRoleId ?? null });
  });
}

/**
 * Hold one callable's requests from a reconnecting browser (a delayed packet;
 * the request itself is unchanged) so the proof fixes which reply arrives
 * first. Install before `member.heal()`, `arm()` right before healing, and
 * `release()` to let the held requests through. While unarmed, requests fall
 * through to the harness's partition route unchanged.
 */
export async function holdCallable(member, name, timeout = 30_000) {
  let armed = false;
  let open;
  const gate = new Promise(resolve => { open = resolve; });
  let held = 0;
  const handler = async route => {
    if (armed) {
      held += 1;
      await Promise.race([gate, delay(timeout)]);
    }
    await route.fallback();
  };
  const matcher = url => url.pathname.endsWith(`/${name}`);
  await member.page.route(matcher, handler);
  return {
    arm() { armed = true; },
    async release() {
      open();
      await member.page.unroute(matcher, handler);
      return held;
    },
  };
}
