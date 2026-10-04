import { expect, it } from 'vitest';
import * as specialistFunctions from './index';

/** Public server entry points required by the PC09 specialist gameplay loop. */
it('exposes a private detector test, an arrest resolution, a VIP visit grant, and attack-bound Ace combat', () => {
  for (const name of [
    'runWolfAgentDetectorTest',
    'resolveArrestPosse',
    'attestVipHostVisit',
    'rerollHostedShipMaintenance',
    'commitPdfFighterAceCombat',
  ]) {
    expect(specialistFunctions, `missing authenticated callable ${name}`).toHaveProperty(name);
    expect((specialistFunctions as Record<string, unknown>)[name]).toHaveProperty('run');
  }
});

it('requires an authenticated source officer before accepting a Fighter Ace permission', async () => {
  const grant = (specialistFunctions as Record<string, unknown>).grantPdfFighterAcePermission as
    { run: (request: unknown) => Promise<unknown> };
  await expect(grant.run({ data: {}, auth: undefined })).rejects.toMatchObject({ code: 'unauthenticated' });
});
