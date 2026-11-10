/**
 * PC10.3 L2 reconnect harness. The returning member is the app's own client
 * stack (src/lib/firebase.ts Auth, Functions and the src/lib/firestore.ts
 * Firestore instance) signed in through the Auth emulator. Other actors use
 * ordinary Auth-emulator ID tokens over the callable HTTP protocol. Seeds and
 * inspections use a rules-disabled context, as local fixtures, never as the
 * actor under test.
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { signInAnonymously } from 'firebase/auth';
import { disableNetwork, enableNetwork, type DocumentData, type Firestore } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '@/lib/firebase';
import { db } from '@/lib/firestore';

const env = import.meta.env;
export const projectId = String(env.VITE_FIREBASE_PROJECT_ID);
const authPort = Number(env.VITE_FIREBASE_AUTH_EMULATOR_PORT);
const functionsPort = Number(env.VITE_FIREBASE_FUNCTIONS_EMULATOR_PORT);
const firestorePort = Number(env.VITE_FIREBASE_FIRESTORE_EMULATOR_PORT);

export interface Actor {
  readonly uid: string;
  readonly idToken: string;
}

export type CallOutcome =
  | { readonly ok: true; readonly result: Record<string, unknown> }
  | { readonly ok: false; readonly status: string; readonly message: string };

/** A fresh Auth-emulator identity for a non-returning actor. */
export async function signUpActor(): Promise<Actor> {
  const response = await fetch(
    `http://127.0.0.1:${authPort}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator-key`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) },
  );
  if (response.status !== 200) throw new Error(`Auth emulator sign-up failed with ${response.status}.`);
  const body = await response.json() as { localId: string; idToken: string };
  return { uid: body.localId, idToken: body.idToken };
}

/** Call a deployed-shape callable over HTTP as an Auth-emulator actor. */
export async function callAs(actor: Actor, name: string, data: Record<string, unknown>): Promise<CallOutcome> {
  const response = await fetch(`http://127.0.0.1:${functionsPort}/${projectId}/us-central1/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${actor.idToken}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json() as {
    result?: Record<string, unknown>;
    error?: { status?: string; message?: string };
  };
  if (response.status === 200 && body.result !== undefined) return { ok: true, result: body.result };
  return { ok: false, status: body.error?.status ?? String(response.status), message: body.error?.message ?? '' };
}

/** Sign the app's own client in; its uid is the returning member. */
export async function signInMember(): Promise<string> {
  // Bind the app's default Firestore instance to the emulator before any
  // module (for example the away-mission reader) obtains it directly.
  db();
  const credential = await signInAnonymously(auth());
  return credential.user.uid;
}

/** Call through the app's own Functions client as the returning member. */
export async function callAsMember(name: string, data: Record<string, unknown>): Promise<CallOutcome> {
  try {
    const reply = await httpsCallable<Record<string, unknown>, Record<string, unknown>>(functions(), name)(data);
    return { ok: true, result: reply.data };
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'unknown';
    return { ok: false, status: code.replace(/^functions\//, '').toUpperCase().replace(/-/g, '_'),
      message: (error as { message?: string }).message ?? '' };
  }
}

/** Drop and restore the returning member's Firestore transport. */
export const memberGoesOffline = (): Promise<void> => disableNetwork(db());
export const memberReconnects = (): Promise<void> => enableNetwork(db());

let testEnvironment: RulesTestEnvironment | undefined;

async function environment(): Promise<RulesTestEnvironment> {
  testEnvironment ??= await initializeTestEnvironment({
    projectId,
    firestore: { host: '127.0.0.1', port: firestorePort, rules: readFileSync('firestore.rules', 'utf8') },
  });
  return testEnvironment;
}

/** Local fixture writes and inspections with rules disabled. */
export async function asFixture<T>(work: (firestore: Firestore) => Promise<T>): Promise<T> {
  let result: T | undefined;
  await (await environment()).withSecurityRulesDisabled(async (context) => {
    result = await work(context.firestore() as unknown as Firestore);
  });
  return result as T;
}

/** A second, independent authenticated client used to test audience denials. */
export async function clientFor(uid: string): Promise<Firestore> {
  return (await environment()).authenticatedContext(uid).firestore() as unknown as Firestore;
}

export async function closeHarness(): Promise<void> {
  await testEnvironment?.cleanup();
  testEnvironment = undefined;
}

/** Record every listener event so tests assert the exact order seen on reconnect. */
export class Recorder<T> {
  readonly events: T[] = [];
  readonly push = (event: T): void => { this.events.push(event); };

  /** Wait for the first event at or after `from` that satisfies `matches`. */
  async next(matches: (event: T) => boolean, label: string, from = 0, timeoutMs = 30_000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const index = this.events.findIndex((event, position) => position >= from && matches(event));
      if (index >= 0) return index;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`${label}: no matching event among ${JSON.stringify(this.events.slice(from))}`);
  }
}

export async function until<T>(read: () => Promise<T>, ready: (value: T) => boolean, label: string): Promise<T> {
  const deadline = Date.now() + 30_000;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await read();
    if (ready(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}: last value ${JSON.stringify(last)}`);
}

/** Key-order-independent JSON, for comparing a listener value with a stored document. */
export function canonical(value: unknown): string {
  const sort = (entry: unknown): unknown => Array.isArray(entry) ? entry.map(sort)
    : typeof entry === 'object' && entry !== null
      ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, sort((entry as Record<string, unknown>)[key])]))
      : entry;
  return JSON.stringify(sort(value));
}

export type FixtureData = DocumentData;
