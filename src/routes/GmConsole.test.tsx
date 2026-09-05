import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import GmConsole from './GmConsole';

vi.mock('@/lib/sessionService', () => ({
  kickGmInstance: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeGmInstances: vi.fn(),
}));

const { kickGmInstance } = await import('@/lib/sessionService');
const { subscribeGmInstances } = await import('@/lib/firestore');

const local = {
  id: 'local-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
  deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
};
const other = {
  id: 'other-1', sessionId: 's1', uid: 'u2', name: 'Tablet',
  deviceLabel: 'iPad / Safari', claimedAt: '2026-01-01T00:01:00.000Z',
};

function renderConsole() {
  return render(
    <MemoryRouter initialEntries={['/gm']}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path="/gm" element={<GmConsole />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table one', joinCode: '4821', phase: 'lobby', ownerUid: 'u1',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'GM', role: 'gm', seatId: null,
      joinedAt: '2026-01-01T00:00:00.000Z',
    },
  );
});

afterEach(() => vi.restoreAllMocks());

function streamInstances(instances: readonly typeof local[]) {
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    onInstances(instances);
    return vi.fn();
  });
}

it('redirects browsers without a local GM claim', () => {
  renderConsole();
  expect(screen.getByText('Roles route')).toBeInTheDocument();
});

it('lists every GM instance and only offers to kick other instances', async () => {
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  renderConsole();

  expect(await screen.findByText('Bridge laptop')).toBeInTheDocument();
  expect(screen.getByText('Tablet')).toBeInTheDocument();
  expect(screen.getByText('iPad / Safari')).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /kick/i })).toHaveLength(1);
});

it('returns to the roles screen', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local]);
  renderConsole();

  await screen.findByText('Bridge laptop');
  await user.click(screen.getByRole('link', { name: /back to roles/i }));

  expect(screen.getByText('Roles route')).toBeInTheDocument();
});

it('kicks another instance and removes it from the list', async () => {
  const user = userEvent.setup();
  useSessionStore.getState().setGmInstance(local);
  streamInstances([local, other]);
  vi.mocked(kickGmInstance).mockResolvedValue('applied');
  renderConsole();

  await user.click(await screen.findByRole('button', { name: /kick tablet/i }));

  expect(kickGmInstance).toHaveBeenCalledWith('other-1');
  await waitFor(() => expect(screen.queryByText('Tablet')).not.toBeInTheDocument());
});

it('updates when the live GM instance stream changes', async () => {
  let publish: ((instances: readonly typeof local[]) => void) | undefined;
  useSessionStore.getState().setGmInstance(local);
  vi.mocked(subscribeGmInstances).mockImplementation((_sessionId, onInstances) => {
    publish = onInstances;
    onInstances([local]);
    return vi.fn();
  });
  renderConsole();
  await screen.findByText('Bridge laptop');

  act(() => publish?.([local, other]));

  expect(await screen.findByText('Tablet')).toBeInTheDocument();
});
