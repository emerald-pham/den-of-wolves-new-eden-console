import { expect, it } from 'vitest';
import { appendPendingTeamAnnouncement, parsePendingTeamAnnouncements } from './teamAnnouncements';

const first = {
  id: 'crisis-c1-r8', kind: 'binding-resolution', title: 'New fleet law',
  details: 'Publish supply requests at Team start.', decidedCycle: 2,
} as const;

it('keeps only bounded, typed pending announcements and appends without replacing earlier outcomes', () => {
  expect(parsePendingTeamAnnouncements(undefined)).toEqual([]);
  expect(appendPendingTeamAnnouncement([], first)).toEqual([first]);
  expect(appendPendingTeamAnnouncement([first], {
    id: 'election-c2-r5', kind: 'presidential-election', title: 'Fleet leadership',
    details: 'President: Ada.', decidedCycle: 3,
  })).toHaveLength(2);
  expect(parsePendingTeamAnnouncements([{ ...first, unexpected: 'private note' }])).toBeNull();
  expect(appendPendingTeamAnnouncement([first], first)).toBeNull();
});
