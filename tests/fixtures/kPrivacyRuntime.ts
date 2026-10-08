import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

/** Parent allocation is required. A missing allocation is setup, never RED. */
export async function allocatedKPrivacyEnvironment() {
  if (process.env.PC10_K_PRIVACY_RED_ALLOCATION !== 'parent-authorized') {
    throw new Error('This rules/SDK fixture requires an explicit parent runtime allocation.');
  }
  const hostAndPort = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.PC10_K_PRIVACY_PROJECT_ID;
  if (!hostAndPort || !/^(127\.0\.0\.1|localhost):[1-9][0-9]{3,4}$/.test(hostAndPort) ||
      !projectId || !/^demo-pc10-k-[a-z0-9-]+$/.test(projectId)) {
    throw new Error('A dedicated local emulator port and synthetic demo project are required.');
  }
  const [host, rawPort] = hostAndPort.split(':');
  const port = Number(rawPort);
  if (port > 65_535) throw new Error('Invalid allocated emulator port.');
  return { projectId, host: host!, port, environment: await initializeTestEnvironment({
    projectId, firestore: { host, port, rules: readFileSync('firestore.rules', 'utf8') },
  }) };
}
