import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {assertSchedulerSessionScope} from './pc10-natural-disconnect.mjs';

const [project,sessionId,port]=process.argv.slice(2);
assert.ok(project?.startsWith('demo-'),'Use an explicit local demo project.');
assert.match(sessionId??'',/^[A-Za-z0-9_-]+$/,'Use one known local session.');
assert.ok(Number.isInteger(Number(port))&&Number(port)>0,'Use the reserved local Firestore port.');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,`127.0.0.1:${port}`,'Never call a production scheduler.');
assert.equal(process.env.GCLOUD_PROJECT,project,'Bind the actual scheduled function to the fixture project.');
assert.equal(process.env.FUNCTIONS_EMULATOR,'true','Mark this as a local background-native invocation.');
const require=createRequire(new URL('../functions/package.json',import.meta.url));
// This separate process lets the unchanged function initialize its actual
// default Admin app, with the explicit emulator configuration above.
const {expireStalePlayers}=require('../functions/lib/index.js');
const {getFirestore}=require('firebase-admin/firestore');
const db=getFirestore();
const [players,instances]=await Promise.all([
 db.collectionGroup('players').where('connected','==',true).get(),
 db.collectionGroup('gmInstances').where('connected','==',true).get(),
]);
assertSchedulerSessionScope(sessionId,players.docs,instances.docs);
assert.equal(typeof expireStalePlayers.run,'function','Invoke the existing scheduled-function handler.');
assert.ok(expireStalePlayers.__endpoint?.scheduleTrigger,'The selected export must be an actual schedule endpoint.');
const startedAt=Date.now();
await expireStalePlayers.run({});
console.log(JSON.stringify({functionName:'expireStalePlayers',invocationClass:'background-native-local-emulator',
 callableHttp:false,localEmulatorOnly:true,foreignSessionConnectedGuard:true,
 connectedPlayersBefore:players.size,connectedGmInstancesBefore:instances.size,
 startedAt,completedAt:Date.now()}));
await db.terminate();
