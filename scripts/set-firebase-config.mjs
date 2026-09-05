#!/usr/bin/env node
/**
 * Stamp the real Firebase web config into the committed placeholders.
 *
 *   node scripts/set-firebase-config.mjs <path-to-config.json>
 *
 * where the JSON is exactly what `firebase apps:sdkconfig WEB <appId> --json`
 * prints (or the object shown in the Firebase console). These values are public
 * identifiers, not secrets -- see src/lib/firebaseConfig.ts.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [, , configPath] = process.argv;
if (!configPath) {
  console.error('usage: node scripts/set-firebase-config.mjs <config.json>');
  process.exit(1);
}

const raw = JSON.parse(readFileSync(configPath, 'utf8'));
const cfg = raw.result?.sdkConfig ?? raw.sdkConfig ?? raw;

const map = {
  __FIREBASE_API_KEY__: cfg.apiKey,
  __FIREBASE_AUTH_DOMAIN__: cfg.authDomain,
  __FIREBASE_PROJECT_ID__: cfg.projectId,
  __FIREBASE_STORAGE_BUCKET__: cfg.storageBucket,
  __FIREBASE_MESSAGING_SENDER_ID__: cfg.messagingSenderId,
  __FIREBASE_APP_ID__: cfg.appId,
};

for (const [token, value] of Object.entries(map)) {
  if (!value) {
    console.error(`missing value for ${token}`);
    process.exit(1);
  }
}

for (const file of ['src/lib/firebaseConfig.ts', '.firebaserc']) {
  let text = readFileSync(file, 'utf8');
  for (const [token, value] of Object.entries(map)) {
    text = text.split(token).join(value);
  }
  writeFileSync(file, text);
  console.log(`stamped ${file}`);
}
