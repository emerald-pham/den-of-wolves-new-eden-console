import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { TeamStartFormalAnnouncementsView } from './TeamStartFormalAnnouncementsView';
import type { TeamStartFormalAnnouncement } from '@/types/game';

it('renders each server-projected formal outcome as a read-only Team-start report', () => {
  const announcements: readonly TeamStartFormalAnnouncement[] = [
    { id: 'resolution-1', kind: 'binding-resolution', title: 'New fleet law', details: 'Every ship will publish its supply requests.', decidedCycle: 2 },
    { id: 'election-1', kind: 'presidential-election', title: 'Fleet leadership', details: 'President: Ada. Vice President: Bo.', decidedCycle: 3 },
  ];
  render(<TeamStartFormalAnnouncementsView announcements={announcements} />);
  expect(screen.getByRole('region', { name: 'Formal Team-start announcements' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'New fleet law' })).toBeVisible();
  expect(screen.getByText('Every ship will publish its supply requests.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Fleet leadership' })).toBeVisible();
  expect(screen.getByText('President: Ada. Vice President: Bo.')).toBeVisible();
});
