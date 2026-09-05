import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import SessionMode from './SessionMode';

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
  useSessionStore.getState().setGmInstance({
    id: 'local-1', sessionId: 's1', uid: 'u1', name: 'Bridge laptop',
    deviceLabel: 'macOS / Chrome', claimedAt: '2026-01-01T00:00:00.000Z',
  });
  useSessionStore.getState().setMode('setup');
});

it.each([
  ['setup', 'setup'],
  ['console', 'console'],
] as const)('returns from %s to the roles screen', async (_label, mode) => {
  const user = userEvent.setup();
  useSessionStore.getState().setMode(mode);
  render(
    <MemoryRouter initialEntries={[`/${mode}`]}>
      <Routes>
        <Route path="/roles" element={<p>Roles route</p>} />
        <Route path={`/${mode}`} element={<SessionMode mode={mode} />} />
      </Routes>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('link', { name: /back to roles/i }));

  expect(screen.getByText('Roles route')).toBeInTheDocument();
});
