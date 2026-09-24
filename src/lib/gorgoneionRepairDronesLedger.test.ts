import { describe, expect, it } from 'vitest';
import { parseGorgoneionRepairDronesLedger } from './gorgoneionRepairDronesLedger';

describe('Gorgoneion Repair Drones ledger', () => {
  it('defaults only a missing legacy ledger and parses a known one-use outcome', () => {
    expect(parseGorgoneionRepairDronesLedger(undefined)).toEqual({
      cycle: 0, revision: 0, hostShipId: '', systemId: '',
    });
    expect(parseGorgoneionRepairDronesLedger({
      cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'reactor',
    })).toEqual({ cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'reactor' });
  });

  it.each([
    ['extra fields', { cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'reactor', actorUid: 'secret' }],
    ['unreachable revision', { cycle: 1, revision: 2, hostShipId: 'aegis', systemId: 'reactor' }],
    ['small ship host', { cycle: 3, revision: 1, hostShipId: 'gorgoneion', systemId: 'reactor' }],
    ['unknown console', { cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'unknown' }],
    ['passive hull armor', { cycle: 3, revision: 1, hostShipId: 'aegis', systemId: 'armoured-hull-i' }],
  ])('fails closed for %s', (_label, value) => {
    expect(parseGorgoneionRepairDronesLedger(value)).toBeNull();
  });
});
