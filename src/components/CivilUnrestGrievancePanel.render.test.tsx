import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CivilUnrestGrievancePanel from './CivilUnrestGrievancePanel';
import { useSessionStore } from '@/store/useSessionStore';

const mocks = vi.hoisted(() => ({
  publicCallbacks: [] as Array<(value: unknown) => void>,
  teamCallbacks: [] as Array<(value: unknown) => void>,
  submit: vi.fn(),
}));

vi.mock('@/lib/firestore', () => ({
  subscribeCivilUnrestPublic: vi.fn((_sessionId: string, callback: (value: unknown) => void) => {
    mocks.publicCallbacks.push(callback);
    return vi.fn();
  }),
  subscribeCivilUnrestGrievance: vi.fn((_sessionId: string, _shipId: string, callback: (value: unknown) => void) => {
    mocks.teamCallbacks.push(callback);
    return vi.fn();
  }),
}));
vi.mock('@/lib/sessionService', () => ({ submitCivilUnrestGrievance: mocks.submit }));

const privateGrievance = {
  sessionId: 's1', crisisId: 'civil-unrest', shipId: 'icebreaker', visibility: 'private',
  text: 'A private team concern.', revision: 1, crisisRevision: 4,
} as const;

beforeEach(() => {
  mocks.publicCallbacks = [];
  mocks.teamCallbacks = [];
  mocks.submit.mockReset();
  useSessionStore.getState().setIdentity(
    {
      id: 's1', name: 'Table', joinCode: '1234', phase: 'active', ownerUid: 'gm', createdAt: '', updatedAt: '',
      activeVesselIds: ['icebreaker'],
    },
    {
      uid: 'u1', sessionId: 's1', displayName: 'Miner', role: 'player', seatId: null,
      assignedRoleId: 'icebreaker-miner', activeConsoleRoleId: 'icebreaker-miner', joinedAt: '',
    },
  );
});

afterEach(() => cleanup());

it('renders the audience contract at phone, landscape, tablet, and desktop viewports', () => {
  for (const width of [320, 390, 844, 1440]) {
    window.innerWidth = width;
    render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} />);
    expect(screen.getByRole('region', { name: 'Civil Unrest team grievances' })).toBeVisible();
    expect(screen.getByText('Private — your current team and facilitators')).toBeVisible();
    expect(screen.getByText('Public — all session members')).toBeVisible();
    expect(screen.getByLabelText("Your team's grievance")).toBeVisible();
    cleanup();
  }
});

it('shows a pending submit, public result, and server error with keyboard focusable controls', async () => {
  render(<CivilUnrestGrievancePanel crisisId="civil-unrest" crisisRevision={4} />);
  act(() => mocks.teamCallbacks[0]!(privateGrievance));
  act(() => mocks.publicCallbacks[0]!({
    type: 'civil-unrest-public', sessionId: 's1', crisisId: 'civil-unrest', state: 'delivered', revision: 4,
    grievances: [{ shipId: 'icebreaker', text: 'A public concern.', revision: 1 }],
  }));
  expect(screen.getByText('A public concern.')).toBeVisible();
  const textarea = screen.getByLabelText("Your team's grievance");
  fireEvent.change(textarea, { target: { value: 'A revised public concern.' } });
  fireEvent.click(screen.getByLabelText('Public — all session members'));
  let resolveSubmit!: (value: 'applied') => void;
  mocks.submit.mockReturnValueOnce(new Promise<'applied'>((resolve) => { resolveSubmit = resolve; }));
  const submit = screen.getByRole('button', { name: 'Revise grievance' });
  submit.focus();
  expect(submit).toHaveFocus();
  fireEvent.click(submit);
  expect(submit).toBeDisabled();
  await act(async () => resolveSubmit('applied'));
  expect(await screen.findByRole('status')).toHaveTextContent('Grievance submitted.');

  fireEvent.change(textarea, { target: { value: 'Another revision.' } });
  mocks.submit.mockRejectedValueOnce(new Error('The grievance changed. Refresh before revising it.'));
  fireEvent.click(screen.getByRole('button', { name: 'Revise grievance' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('The grievance changed. Refresh before revising it.'));
});
