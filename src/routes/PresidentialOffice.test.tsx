import { beforeEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ElectionWorkspace from './ElectionWorkspace';
import PresidentOffice from './PresidentOffice';

const officeStyles = readFileSync('src/routes/presidential-office.css', 'utf8');

beforeEach(() => {
  useSessionStore.getState().reset();
  useSessionStore.getState().setIdentity({
    id: 'office-layout-session', name: 'Office layout test', joinCode: '123456',
    phase: 'active', ownerUid: 'u1', createdAt: '', updatedAt: '', currentTurn: 1,
  }, {
    uid: 'u1', sessionId: 'office-layout-session', displayName: 'Player',
    role: 'player', seatId: null, joinedAt: '',
  });
});

it('keeps the election page content clear of the fixed app header', () => {
  render(<MemoryRouter><ElectionWorkspace /></MemoryRouter>);

  const page = screen.getByRole('main');
  expect(screen.getByRole('heading', { name: 'Presidential election', level: 1 })).toBeVisible();
  expect(page.className).toBe('election-office');
  expect(officeStyles).toMatch(/\.election-office,\s*\.president-office\s*\{[\s\S]*?padding:\s*calc\(/);
  expect(officeStyles).toContain('var(--app-header-height, 4.25rem)');
});

it('keeps the President office page content clear of the fixed app header', () => {
  render(<MemoryRouter><PresidentOffice /></MemoryRouter>);

  const page = screen.getByRole('main');
  expect(screen.getByRole('heading', { name: "President's office" })).toBeVisible();
  expect(page.className).toBe('president-office');
  expect(officeStyles).toMatch(/\.election-office,\s*\.president-office\s*\{[\s\S]*?padding:\s*calc\(/);
  expect(officeStyles).toContain('var(--app-header-height, 4.25rem)');
});

it.each([
  { path: '/election', page: <ElectionWorkspace /> },
  { path: '/president', page: <PresidentOffice /> },
])('returns from $path through its visible keyboard control without releasing identity', async ({ path, page }) => {
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path={path} element={page} />
      <Route path="/console" element={<h1>Station chooser</h1>} />
    </Routes>
  </MemoryRouter>);

    const back = screen.getByRole('link', { name: /^Back to stations$/ });
  back.focus();
  expect(back).toHaveFocus();
  await user.keyboard('{Enter}');
  expect(screen.getByRole('heading', { name: 'Station chooser' })).toBeVisible();
  expect(useSessionStore.getState().session?.id).toBe('office-layout-session');
  expect(useSessionStore.getState().me?.uid).toBe('u1');
});
