import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// The original safe receipt stays sanitized. Preserve the full primary error
// as the outer error's cause even when its one diagnostic write fails.
const source = await readFile(new URL('./pc10-two-live-gm-responsibility-proof.mjs', import.meta.url), 'utf8');
const a = source.lastIndexOf('    } catch (error) {') + '    } catch (error) {'.length;
const b = source.indexOf('\n    }\n  } });\n}', a);
assert.ok(a > 0 && b > a);
async function fixture({ writeFails = false, frozen = false } = {}) {
  const original = new Error('Synthetic original private assertion.'), secondary = new Error('Synthetic receipt write failure.');
  if (frozen) Object.freeze(original);
  const writes = [], scope = vm.createContext({ Error, JSON,
    safeHeldFailureObservations: () => ({}), safeResponsibilityFailureComparison: () => ({}),
    resolve: (...parts) => parts.join('/'), writeFile: async (path, bytes, options) => {
      writes.push({ value: JSON.parse(bytes), options }); if (writeFails) throw secondary;
    } });
  const run = new vm.Script('(async function(error,evidence,stage,failure,context) {\n' + source.slice(a, b) + '\n})')
    .runInContext(scope);
  let caught;
  try { await run(original, {}, 'synthetic-stage', { guard: 'synthetic-guard', held: {} }, { directory: '/synthetic-owned-directory' }); }
  catch (error) { caught = error; }
  assert.ok(caught); return { original, secondary, caught, writes };
}
test('bridge: safe receipt writer preserves its original cause with one sanitized write', async () => {
  const f = await fixture(); assert.equal(f.caught.cause, f.original); assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].options.flag, 'wx'); assert.equal(JSON.stringify(f.writes[0].value).includes(f.original.message), false);
});
for (const frozen of [false, true]) {
  test('receipt write failure retains the original cause and secondary stack; frozen=' + frozen, async () => {
    const f = await fixture({ writeFails: true, frozen }); assert.equal(f.caught.cause, f.original);
    assert.equal(f.caught.receiptError, f.secondary); assert.equal(f.caught.cause.stack, f.original.stack);
    assert.equal(f.caught.receiptError.stack, f.secondary.stack); assert.equal(f.writes.length, 1);
  });
}
