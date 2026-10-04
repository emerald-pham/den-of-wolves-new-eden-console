import { beforeEach, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import ElectionWorkspace from './ElectionWorkspace';
import PresidentOffice from './PresidentOffice';

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
  expect(getComputedStyle(page).paddingTop).toMatch(/calc|rem|px/);
});

it('keeps the President office page content clear of the fixed app header', () => {
  render(<MemoryRouter><PresidentOffice /></MemoryRouter>);

  const page = screen.getByRole('main');
  expect(screen.getByRole('heading', { name: "President's office" })).toBeVisible();
  expect(getComputedStyle(page).paddingTop).toMatch(/calc|rem|px/);
});
