import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import RoleBrief from './RoleBrief';

vi.mock('@/lib/vulcanLabourService', () => ({
  runVulcanAdditionalLabour: vi.fn(async () => ({ message: 'Hydroponics: spent 1 water, generated 3 food.' })),
}));
const { runVulcanAdditionalLabour } = await import('@/lib/vulcanLabourService');

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'casting', ownerUid: 'gm1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
      assignedRoleId: 'admiral', joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setRoleBrief({
    assignmentUid: 'u1', roleId: 'admiral', roleName: 'Admiral', vesselName: 'AEGIS',
    text: 'Coordinate the fleet.', commonRules: 'Keep this brief private.',
    ownedCraftIds: ['fighter-wing-alpha'], setupRevision: 1,
  });
});

it('renders the assigned role brief, common rules, and visible return control', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { name: 'Admiral' })).toBeVisible();
  expect(screen.getByText('Coordinate the fleet.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Role-owned craft' })).toBeVisible();
  expect(screen.getByText('Fighter Wing Alpha')).toBeVisible();
  expect(screen.getByText('Printed owner')).toBeVisible();
  expect(screen.getByText('Wing Commander')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Phase rules' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Combat rules' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Action rules' })).toBeVisible();
  expect(screen.queryByText(/fighter count|current docking|holder uid/i)).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Common rules' })).toBeVisible();
  await user.click(screen.getByRole('link', { name: /return to role selection/i }));
  expect(screen.getByText('Role selection')).toBeInTheDocument();
});

it('renders Voyage 33-0 support as a private role section when admitted', () => {
  useSessionStore.getState().setRoleBrief({
    ...useSessionStore.getState().roleBrief!,
    voyage33Motivation: 'Support Voyage 33-0\'s survivors privately.',
  });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const section = screen.getByRole('region', { name: 'Voyage 33-0 support' });
  expect(section).toHaveTextContent('Private arrival priority');
  expect(section).toHaveTextContent('Support Voyage 33-0\'s survivors privately.');
});

it('renders a facilitator-labeled Universal Arbour call only on the private brief', () => {
  useSessionStore.getState().setPrivateLoyalty({ kind: 'universal-arbour', suspicion: 10 });
  useSessionStore.getState().setArbourVision({
    sessionId: 's1', recipientUid: 'u1', revision: 1, kind: 'danger',
    text: 'There is danger at the outer relay.', label: 'FACILITATOR CALL',
  });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('FACILITATOR CALL')).toBeVisible();
  expect(screen.getByRole('heading', { name: /Universal Arbour vision/i })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Universal Arbour vision // danger' })).toHaveTextContent(
    'There is danger at the outer relay.',
  );
});

it('traps focus in a current facilitator call and restores the review control on dismissal', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setPrivateLoyalty({ kind: 'universal-arbour', suspicion: 10 });
  useSessionStore.getState().setArbourVision({
    sessionId: 's1', recipientUid: 'u1', revision: 1, kind: 'danger',
    text: 'There is danger at the outer relay.', label: 'FACILITATOR CALL',
  });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const dialog = screen.getByRole('dialog', { name: 'Facilitator call' });
  expect(dialog).toHaveAccessibleDescription(/current player identity/i);
  expect(dialog).toHaveTextContent('There is danger at the outer relay.');
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Facilitator call' }));
  await user.tab();
  const close = screen.getByRole('button', { name: 'Continue' });
  expect(document.activeElement).toBe(close);
  await user.keyboard('{Escape}');

  expect(screen.queryByRole('dialog', { name: 'Facilitator call' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review facilitator call' })).toHaveFocus();
});

it('withholds facilitator content when its session or selected recipient does not match', () => {
  useSessionStore.getState().setArbourVision({
    sessionId: 'other-session', recipientUid: 'u1', revision: 1, kind: 'danger',
    text: 'Private danger detail.', label: 'FACILITATOR CALL',
  });
  useSessionStore.getState().setFacilitatorRuleCall({
    sessionId: 's1', callId: 'call-wrong-reader', revision: 1,
    ambiguity: 'Private question.', source: 'Private source', decision: 'Private decision.',
    audience: 'selected-player', recipientUid: 'another-player', label: 'FACILITATOR RULE CALL',
  });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.queryByRole('dialog', { name: 'Facilitator call' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Review facilitator call' })).not.toBeInTheDocument();
  expect(screen.queryByText('Private danger detail.')).not.toBeInTheDocument();
  expect(screen.queryByText('Private question.')).not.toBeInTheDocument();
  expect(screen.queryByText('Private decision.')).not.toBeInTheDocument();
});

it('renders a selected facilitator rule call with durable source and decision fields', () => {
  useSessionStore.getState().setFacilitatorRuleCall({
    sessionId: 's1', callId: 'call-1', revision: 1,
    ambiguity: 'Does docking happen before movement?',
    source: 'Facilitator reference',
    decision: 'Use the printed docking state for this turn.',
    audience: 'selected-player', recipientUid: 'u1',
    actorUid: 'gm1', createdAt: '2026-01-01T00:00:00.000Z',
    label: 'FACILITATOR RULE CALL',
  });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const call = screen.getByRole('region', { name: 'Facilitator rule call' });
  expect(call).toHaveTextContent('Does docking happen before movement?');
  expect(call).toHaveTextContent('Facilitator reference');
  expect(call).toHaveTextContent('Use the printed docking state for this turn.');
  expect(call).toHaveTextContent('Decision source // Facilitator reference');
  expect(call).toHaveTextContent('Decision actor // facilitator identity withheld');
  expect(call).toHaveTextContent('Decision time //');
  expect(call).not.toHaveTextContent('gm1');
});

it('labels a selected rule call with unknown time when its private projection omits server metadata', () => {
  useSessionStore.getState().setFacilitatorRuleCall({
    sessionId: 's1', callId: 'call-2', revision: 1,
    ambiguity: 'Which route applies?', source: 'Facilitator reference', decision: 'Use the printed route.',
    audience: 'selected-player', recipientUid: 'u1', label: 'FACILITATOR RULE CALL',
  });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const call = screen.getByRole('region', { name: 'Facilitator rule call' });
  expect(call).toHaveTextContent('Decision actor // facilitator identity withheld');
  expect(call).toHaveTextContent('Decision time // unavailable in this projection');
});

it('returns to role selection when the local assignment no longer matches', () => {
  useSessionStore.getState().setMe({ ...useSessionStore.getState().me!, assignedRoleId: null });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Role selection')).toBeInTheDocument();
});

it('does not render a brief assigned to another player', () => {
  useSessionStore.getState().setRoleBrief({
    ...useSessionStore.getState().roleBrief!,
    assignmentUid: 'other-player',
  });
  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  expect(screen.getByText('Role selection')).toBeInTheDocument();
});

it('states the Warrior Salvage Drones trigger while the damage ledger is unavailable', () => {
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!,
    assignedRoleId: null,
    replacementRoleId: 'warrior-captain',
  });
  useSessionStore.getState().setRoleBrief({
    ...useSessionStore.getState().roleBrief!,
    roleId: 'warrior-captain',
    roleName: 'Warrior Captain',
    vesselName: 'RSS Warrior',
  });

  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const workspace = screen.getByRole('region', { name: 'Warrior Captain workspace' });
  expect(within(workspace).getByRole('heading', { name: 'Salvage Drones' })).toBeVisible();
  expect(within(workspace).getByText(/after an attack, when charged, roll once for each damage/i)).toBeVisible();
  expect(within(workspace).getByText(/attack damage tracking and salvage rolls are not available yet/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /roll|salvage|award/i })).not.toBeInTheDocument();
});

it('exposes the charged Vulcan Additional Labour flow on the private role brief', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1', currentTurn: 1,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      activeVesselIds: ['aegis', 'dione', 'refinery-124'],
      turnPhase: {
        turn: 1, teamPhaseEndsAt: '2026-09-12T17:00:00.000Z', openAirspaceEndsAt: '2026-09-12T18:00:00.000Z',
        airspace: { state: 'lifted', tickerActive: true, pressAccess: false },
      },
      smallShipStates: {
        vulcan: {
          id: 'vulcan', hostShipId: 'aegis', dockingRevision: 1, population: 15_000, unrest: 0,
          cycle: { step: 5, revision: 3, turn: 1, results: {}, charges: ['additional-labour-1', 'additional-labour-2'] },
        },
      },
      maintenanceCycles: {
        dione: { step: 0, revision: 0, results: {}, charges: [], refuelled: [] },
        'refinery-124': { step: 0, revision: 2, results: {}, charges: [], refuelled: [] },
      },
      shipDamage: {
        dione: { damagedSystemIds: [], destroyed: false },
        'refinery-124': { damagedSystemIds: [], destroyed: false },
      },
      shipResources: {
        'refinery-124': { ore: 12, fuel: 5, food: 9, water: 4, materials: 0, securityTeams: 6 },
      },
      shipUpgrades: { 'refinery-124': ['fuel-refinery-ii'] },
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Player', role: 'player', seatId: null,
      assignedRoleId: null, replacementRoleId: 'vulcan-captain', joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
  useSessionStore.getState().setRoleBrief({
    assignmentUid: 'u1', roleId: 'vulcan-captain', roleName: 'Vulcan Captain', vesselName: 'Vulcan',
    text: 'Manage the Vulcan.', commonRules: 'Keep this brief private.', setupRevision: 1,
  });

  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const workspace = screen.getByRole('region', { name: 'Vulcan Captain workspace' });
  expect(within(workspace).getByRole('heading', { name: 'Additional Labour' })).toBeVisible();
  expect(within(workspace).getByText(/roll two dice at Medium and Short range/i)).toBeVisible();
  expect(within(workspace).getByLabelText('Additional Labour procedure')).toHaveTextContent('Charged');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Additional Labour target ship' }), 'dione');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Additional Labour target console' }), 'hydroponics');
  await user.click(screen.getByRole('button', { name: /use additional labour/i }));
  expect(runVulcanAdditionalLabour).toHaveBeenCalledWith('additional-labour-1', 'dione', 'hydroponics', 3, 0, undefined, undefined);
  expect(screen.getByText(/Hydroponics: spent 1 water/i)).toBeVisible();
  expect(screen.getByText(/If another action changes the session first, refresh before trying again/i)).toBeVisible();
  expect(screen.getByRole('link', { name: /return to role selection/i })).toBeVisible();

  await user.selectOptions(screen.getByRole('combobox', { name: 'Additional Labour target ship' }), 'refinery-124');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Additional Labour target console' }), 'fuel-refinery-ii');
  const ore = screen.getByRole('spinbutton', { name: 'Additional Labour ore to refine' });
  expect(ore).toHaveAttribute('max', '15');
  await user.clear(ore);
  await user.type(ore, '12');
  await user.click(screen.getByRole('button', { name: /use additional labour/i }));
  expect(runVulcanAdditionalLabour).toHaveBeenLastCalledWith(
    'additional-labour-1', 'refinery-124', 'fuel-refinery-ii', 3, 2, undefined, 12,
  );
});

it('keeps Vulcan Additional Labour guidance readable and outcome-focused', () => {
  const stylesheet = readFileSync('src/index.css', 'utf8');

  expect(stylesheet).toMatch(/\.vulcan-labour-panel p\s*\{\s*font-size:\s*0\.875rem;/);
  expect(stylesheet).not.toContain('server checks current revisions before writing');
});

it.each([
  ['gorgoneion-captain', 'Gorgoneion', 'Mission Support', 'Bulk Haulage'],
  ['capybara-small-captain', 'Capybara', 'Bulk Haulage', 'Mission Support'],
  ['warrior-captain', 'Warrior', 'Reclamator', 'Force Field Projector'],
  ['vulcan-captain', 'Vulcan', 'Laser Cannon', 'Salvage Drones'],
] as const)('isolates the %s workspace to its selected vessel', (roleId, vesselName, ownAction, foreignAction) => {
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, assignedRoleId: null, replacementRoleId: roleId,
  });
  useSessionStore.getState().setRoleBrief({
    ...useSessionStore.getState().roleBrief!, roleId, roleName: `${vesselName} Captain`, vesselName,
  });

  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const workspace = screen.getByRole('region', { name: `${vesselName} Captain workspace` });
  expect(within(workspace).getByRole('heading', { name: ownAction })).toBeVisible();
  expect(within(workspace).queryByRole('heading', { name: foreignAction })).not.toBeInTheDocument();
});

it('withholds base Capybara procedures when the session selects the expansion Capybara', () => {
  useSessionStore.getState().setSession({
    ...useSessionStore.getState().session!, expansion: 'capybara', capybaraEnabled: true,
  });
  useSessionStore.getState().setMe({
    ...useSessionStore.getState().me!, assignedRoleId: null, replacementRoleId: 'capybara-small-captain',
  });
  useSessionStore.getState().setRoleBrief({
    ...useSessionStore.getState().roleBrief!, roleId: 'capybara-small-captain', roleName: 'Capybara Captain', vesselName: 'Capybara',
  });

  render(
    <MemoryRouter initialEntries={['/brief']}>
      <Routes>
        <Route path="/brief" element={<RoleBrief />} />
        <Route path="/roles" element={<p>Role selection</p>} />
      </Routes>
    </MemoryRouter>,
  );

  const workspace = screen.getByRole('region', { name: 'Capybara Captain workspace' });
  expect(within(workspace).getByRole('alert')).toHaveTextContent(/different Capybara mode/i);
  expect(within(workspace).queryByRole('heading', { name: 'Cargo Transfer' })).not.toBeInTheDocument();
});

it('keeps extra-ship workspace copy console-styled and readable at phone size', () => {
  const stylesheet = readFileSync('src/index.css', 'utf8');

  expect(stylesheet).toMatch(/\.extra-ship-workspace\s*\{[^}]*font-family:\s*var\(--cic-mono\)/s);
  expect(stylesheet).toMatch(/\.extra-ship-workspace__actions p\s*\{[^}]*font-size:\s*1rem/s);
  expect(stylesheet).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(100%,\s*10rem\),\s*1fr\)\)/);
});
