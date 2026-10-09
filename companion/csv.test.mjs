import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { responseCsv } from './csv.mjs';
function parse(csv) {
  const result = spawnSync('python3', ['-c', 'import csv,io,json,sys; print(json.dumps(list(csv.reader(io.StringIO(sys.stdin.read(),newline=""))),ensure_ascii=False))'], { input: csv, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
}
test('CSV round trips Unicode comma quotes multiline and multiple-choice values via independent parser', () => {
  const answers = { unicode: 'Zoë — 海狼 🐺', comma: 'Pilot, Engineer', quotes: 'The "Wolf"', multiline: 'line one\nline two\r\nline three', multiple: ['Pilot, A', '"Engineer"', '外交官'] };
  const rows = parse(responseCsv([{ id: 'synthetic-response', version: 2, answers }]));
  assert.deepEqual(rows[0], ['response_id', 'form_version', ...Object.keys(answers)]);
  assert.deepEqual(rows[1], ['synthetic-response', '2', ...Object.values(answers).map(v => typeof v === 'string' ? v : JSON.stringify(v))]);
});
test('formula prefixes including invisible controls are neutralized in every CSV column', () => {
  const values = ['=1+1', '+SUM(1,2)', '-1+1', '@SUM(1)', '  =1', '\t=1', '\r=1', '\n=1', '\u0000=1', '\u200b=1', '\ufeff=1'];
  const records = values.map((value, index) => ({ id: value, version: 1, answers: { [value]: value, safe: `Fixture ${index}` } }));
  const rows = parse(responseCsv(records));
  for (const row of rows) for (const cell of row) {
    const normalized = cell.replace(/[\u0000-\u0020\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').trimStart();
    assert.ok(!/^[=+\-@]/.test(normalized), JSON.stringify(cell));
  }
  assert.ok(rows[1][0].startsWith("'"));
});
