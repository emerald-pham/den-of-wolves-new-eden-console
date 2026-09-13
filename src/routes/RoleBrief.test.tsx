import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
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
  expect(screen.getByRole('heading', { name: 'Common rules' })).toBeVisible();
  await user.click(screen.getByRole('link', { name: /return to role selection/i }));
  expect(screen.getByText('Role selection')).toBeInTheDocument();
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
  expect(screen.getByText('There is danger at the outer relay.')).toBeVisible();
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

  expect(screen.getByRole('heading', { name: 'Salvage Drones' })).toBeVisible();
  expect(screen.getByText(/after a wolf attack, a charged salvage drones console rolls once/i)).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(/attack damage tracking and salvage rolls are not available yet/i);
  expect(screen.queryByRole('button', { name: /roll|salvage|award/i })).not.toBeInTheDocument();
});

it('exposes the charged Vulcan Additional Labour flow on the private role brief', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'active', ownerUid: 'gm1', currentTurn: 1,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      activeVesselIds: ['aegis', 'dione'],
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
      },
      shipDamage: { dione: { damagedSystemIds: [], destroyed: false } },
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

  expect(screen.getByRole('heading', { name: 'Additional Labour' })).toBeVisible();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Additional Labour target ship' }), 'dione');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Additional Labour target console' }), 'hydroponics');
  await user.click(screen.getByRole('button', { name: /use additional labour/i }));
  expect(runVulcanAdditionalLabour).toHaveBeenCalledWith('additional-labour-1', 'dione', 'hydroponics', 3, 0, undefined);
  expect(screen.getByText(/Hydroponics: spent 1 water/i)).toBeVisible();
  expect(screen.getByText(/If another action changes the session first, refresh before trying again/i)).toBeVisible();
  expect(screen.getByRole('link', { name: /return to role selection/i })).toBeVisible();
});

it('keeps Vulcan Additional Labour guidance readable and outcome-focused', () => {
  const stylesheet = readFileSync('src/index.css', 'utf8');

  expect(stylesheet).toMatch(/\.vulcan-labour-panel p\s*\{\s*font-size:\s*0\.875rem;/);
  expect(stylesheet).not.toContain('server checks current revisions before writing');
});
