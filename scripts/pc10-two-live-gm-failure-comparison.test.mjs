import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Execute the actual existing failed-receipt writer with synthetic exceptions.
// No browser, Firebase, Auth, SDK, process, observer or gameplay is launched.
// Missing module/bootstrap is not RED. The bridge exercises OLD catch behavior.
const url = new URL('./pc10-two-live-gm-responsibility-proof.mjs', import.meta.url);
const source = await readFile(url, 'utf8');
const moduleContext = vm.createContext({ Buffer });
const extra = '\nexport { safeHeldFailureObservations' +
  (source.includes('function safeResponsibilityFailureComparison(') ? ', safeResponsibilityFailureComparison' : '') + ' };\n';
const module = new vm.SourceTextModule(source + extra, { context: moduleContext,
  identifier: url.href, initializeImportMeta(meta) { meta.url = url.href; } });
const allowed = new Set(['node:assert/strict','node:crypto','node:fs/promises','node:child_process','node:path','node:url']);
await module.link(async name => {
  assert.ok(allowed.has(name));
  const namespace = name === 'node:child_process' ? { execFileSync() { throw Error('No processes in finite tests.'); } } : await import(name);
  const rows = Object.entries(namespace);
  return new vm.SyntheticModule(rows.map(([key]) => key), function () {
    for (const [key,value] of rows) this.setExport(key,value);
  }, { context: moduleContext, identifier: name });
});
await module.evaluate();
const begin = source.lastIndexOf('    } catch (error) {') + '    } catch (error) {'.length;
const end = source.indexOf('\n    }\n  } });\n}', begin);
assert.ok(begin > 0 && end > begin, 'Bind the actual existing failure writer.');
const body = source.slice(begin, end);
async function receipt(error) {
  const writes = [];
  const scope = vm.createContext({ Error, JSON,
    safeHeldFailureObservations: module.namespace.safeHeldFailureObservations,
    safeResponsibilityFailureComparison: module.namespace.safeResponsibilityFailureComparison,
    resolve: (...parts) => parts.join('/'),
    writeFile: async (path, bytes, options) => { assert.equal(options.flag,'wx'); writes.push({ path, value:JSON.parse(bytes) }); },
  });
  const run = new vm.Script('(async function(error,evidence,stage,failure,context) {\n' + body + '\n})',
    { filename:'actual-existing-two-gm-failure-writer' }).runInContext(scope);
  const evidence = { status:'failed-uncredited', moves:[], wholeGameAccepted:false };
  await assert.rejects(() => run(error,evidence,'Share assistant facilitator',
    { guard:'responsibility.move-1.current-original-authority-and-rendered-control',
      held:{ responsibilityCheckpoint:{step:0,part:'original-gm-current-revision'} } },
    { directory:'/native-synthetic-receipts' }), caught => {
    assert.equal(caught.cause,error); return true;
  });
  assert.equal(writes.length,1);
  return writes[0].value;
}
function synthetic(actual,expected,stack) {
  const error = Object.assign(new Error('Unretained synthetic-private-message'),
    { name:'AssertionError',code:'ERR_ASSERTION',operator:'strictEqual',actual,expected });
  if (stack) error.stack = stack;
  return error;
}
const ownedFrame='AssertionError: synthetic-private-message\n    at assertOriginalActor (file:///private/tmp/dow-pc10-execution-20261005/scripts/pc10-member-gm-lifecycle-contracts.mjs:51:10)';

test('bridge: the actual OLD failure writer preserves stage, guard and original cause without raw message', async () => {
  const value = await receipt(synthetic(2,1));
  assert.equal(value.stage,'Share assistant facilitator');
  assert.equal(value.errorName,'AssertionError'); assert.equal(value.errorCode,'ERR_ASSERTION');
  assert.equal(value.wholeGameAccepted,false); assert.deepEqual(value.moves,[]);
  assert.equal(JSON.stringify(value).includes('synthetic-private-message'),false);
});

test('an original numeric authority assertion exposes only safe comparison and owned Source frame', async () => {
  const value = await receipt(synthetic(2,1,ownedFrame));
  assert.deepEqual(value.failureComparison,{operator:'strictEqual',
    actual:{kind:'safe-nonnegative-integer',value:2},expected:{kind:'safe-nonnegative-integer',value:1},
    sourceFrame:{file:'pc10-member-gm-lifecycle-contracts.mjs',line:51,column:10}});
  assert.deepEqual(value.heldObservations.responsibilityCheckpoint,{step:0,part:'original-gm-current-revision'});
});

test('a held rendered-control assertion may expose boolean mismatch without an extra observation', async () => {
  const value = await receipt(synthetic(false,true));
  assert.deepEqual(value.failureComparison.actual,{kind:'boolean',value:false});
  assert.deepEqual(value.failureComparison.expected,{kind:'boolean',value:true});
});

test('strings, raw UID/session values, nested payloads and unowned stack paths are never emitted', async () => {
  const marker='synthetic-private-uid-session-marker';
  const error=synthetic(marker,{nested:marker},'AssertionError: '+marker+'\n    at privateHandler (file:///foreign/private-'+marker+'.mjs:73:2)');
  error.token=marker;
  const value=await receipt(error);
  assert.deepEqual(value.failureComparison.actual,{kind:'not-emitted',value:null});
  assert.deepEqual(value.failureComparison.expected,{kind:'not-emitted',value:null});
  assert.equal(value.failureComparison.sourceFrame,null);
  assert.equal(JSON.stringify(value).includes(marker),false);
});

for (const actual of [-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1]) {
  test('unsafe or invalid numeric comparison '+String(actual)+' remains unreported', async () => {
    const value=await receipt(synthetic(actual,null));
    assert.deepEqual(value.failureComparison.actual,{kind:'not-emitted',value:null});
    assert.deepEqual(value.failureComparison.expected,{kind:'not-emitted',value:null});
  });
}
