import { describe, expect, it } from 'vitest';
import {
  EXTRA_SHIP_CAPTAIN_WORKSPACES,
  extraShipCaptainWorkspaceFor,
} from './extraShipCaptainWorkspaces';

describe('extra-ship Captain workspace catalog', () => {
  it('binds exactly one private vessel workspace to each extra-ship Captain', () => {
    expect(EXTRA_SHIP_CAPTAIN_WORKSPACES.map(({ roleId, vesselId }) => ({ roleId, vesselId }))).toEqual([
      { roleId: 'gorgoneion-captain', vesselId: 'gorgoneion' },
      { roleId: 'capybara-small-captain', vesselId: 'capybara-small' },
      { roleId: 'warrior-captain', vesselId: 'warrior' },
      { roleId: 'vulcan-captain', vesselId: 'vulcan' },
    ]);
    for (const workspace of EXTRA_SHIP_CAPTAIN_WORKSPACES) {
      expect(new Set(workspace.actions.map(({ id }) => id)).size).toBe(workspace.actions.length);
    }
  });

  it('keeps each vessel procedure set distinct and source-aligned', () => {
    expect(extraShipCaptainWorkspaceFor('gorgoneion-captain')?.actions.map(({ name }) => name)).toEqual([
      'Jump Drive', 'Mission Support', 'Repair Drones', 'Missile Array', 'Force Field Projector',
    ]);
    expect(extraShipCaptainWorkspaceFor('capybara-small-captain')?.actions.map(({ name }) => name)).toEqual([
      'Jump Drive', 'Bulk Haulage', 'Cargo Transfer', 'Water Reclimator', 'Hydroponics', 'Fuel Processor',
    ]);
    expect(extraShipCaptainWorkspaceFor('warrior-captain')?.actions.map(({ name }) => name)).toEqual([
      'Jump Drive', 'Reclamator', 'Cargo Transfer', 'Repair Drones', 'Salvage Drones',
    ]);
    expect(extraShipCaptainWorkspaceFor('vulcan-captain')?.actions.map(({ name }) => name)).toEqual([
      'Jump Drive', 'Laser Cannon', 'Additional Labour',
    ]);
  });

  it('never imports expansion Scrap or another vessel action into the base Capybara workspace', () => {
    const workspace = extraShipCaptainWorkspaceFor('capybara-small-captain');
    const copy = JSON.stringify(workspace);
    expect(copy).not.toMatch(/scrap/i);
    expect(copy).not.toMatch(/laser cannon|missile array|repair drones/i);
  });

  it('connects the Gorgoneion Repair Drones card to its server-owned live workspace control', () => {
    expect(extraShipCaptainWorkspaceFor('gorgoneion-captain')?.actions.find(({ id }) => id === 'repair-drones'))
      .toMatchObject({
        phase: 'Coordination', charge: 'reactor', control: 'live-below',
        effect: expect.stringMatching(/3 materials.*one damaged host console.*once per cycle/i),
        availability: expect.stringMatching(/live server-owned repair control appears below/i),
      });
  });

  it('connects Warrior Repair Drones to its current charged repair control', () => {
    expect(extraShipCaptainWorkspaceFor('warrior-captain')?.actions.find(({ id }) => id === 'repair-drones'))
      .toMatchObject({
        phase: 'Coordination', charge: 'reactor', control: 'live-below',
        effect: expect.stringMatching(/6 host materials.*one or two damaged host consoles.*once per cycle/i),
        availability: expect.stringMatching(/live server-owned repair control appears below/i),
      });
  });

  it('uses cycle terminology and returns no workspace for ordinary replacement roles', () => {
    expect(JSON.stringify(EXTRA_SHIP_CAPTAIN_WORKSPACES)).not.toMatch(/\bturn\b/i);
    expect(extraShipCaptainWorkspaceFor('doctor')).toBeUndefined();
    expect(extraShipCaptainWorkspaceFor(null)).toBeUndefined();
  });
});
