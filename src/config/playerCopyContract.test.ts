import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanPlayerCopyContract } from '../../scripts/player-copy-contract.mjs';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('player-facing copy contract', () => {
  it('keeps production, accessible, update, error, install, and changelog copy on the approved vocabulary', () => {
    expect(scanPlayerCopyContract()).toEqual([]);
  });

  it('rejects visible text, accessible names, and changelog literals while ignoring internal wire names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'player-copy-contract-'));
    temporaryRoots.push(root);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'public'), { recursive: true });
    fs.mkdirSync(path.join(root, 'config'), { recursive: true });
    fs.copyFileSync('config/player-copy-contract.json', path.join(root, 'config/player-copy-contract.json'));
    fs.writeFileSync(path.join(root, 'index.html'), '<title>Iris Control</title>');
    fs.writeFileSync(path.join(root, 'public/manifest.webmanifest'), '{"name":"Turn Console"}');
    fs.writeFileSync(path.join(root, 'src/Example.tsx'), `
      const currentTurn = 1;
      const wireKey = 'advance-turn';
      export const Example = () => <>
        <p>Turn 4</p>
        <p>turn</p>
        <button aria-label="Turn Press on">Press</button>
        <button aria-label="turn">Proceed</button>
      </>;
      export const CHANGELOG = ['Iris authentication used firebase.'];
    `);

    expect(scanPlayerCopyContract({ root }).map(({ ruleId }) => ruleId)).toEqual([
      'retired-iris-brand',
      'numbered-clock-turn',
      'numbered-clock-turn',
      'numbered-clock-turn',
      'numbered-clock-turn',
      'numbered-clock-turn',
      'connection-vendor',
      'retired-iris-brand',
    ]);
  });
});
