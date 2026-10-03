import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createPc07AttackHttpSession} from './pc07-attack-http-session.mjs';
import {provePc07NavigationHttp} from './pc07-navigation-http-proof.mjs';

const directory=process.env.PC07_HTTP_EVIDENCE_DIR;
assert.ok(directory,'An external evidence directory is required.');
let projection;
const fixture=await createPc07AttackHttpSession({beforeDeclaration:async session=>{projection=await provePc07NavigationHttp(session);}});
try{
 await mkdir(directory,{recursive:true});
 await writeFile(`${directory}/navigation-http.json`,JSON.stringify({...projection,
  fixtureChanges:fixture.fixtureChanges,declarationParksRealTransit:true,completedAt:new Date().toISOString()},null,2)+'\n');
 console.log('PC07 normal authenticated current-group navigation and server transit sampling passed.');
}finally{await fixture.cleanup();}
