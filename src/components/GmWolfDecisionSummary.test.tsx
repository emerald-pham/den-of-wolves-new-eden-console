import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import GmWolfDecisionSummary from './GmWolfDecisionSummary';
import type { Player, WolfAttackDecisionSummary } from '@/types/game';

const players = [
  { uid: 'private-commander-uid', displayName: 'Rowan' },
  { uid: 'private-eo-uid', displayName: 'Mira' },
  { uid: 'private-captain-uid', displayName: 'Ari' },
].map(player => ({ ...player, sessionId: 's1', role: 'player', seatId: null,
  joinedAt: '2026-10-03T08:00:00.000Z' })) as readonly Player[];
const pending: WolfAttackDecisionSummary = {
  commander: { status: 'pending', actors: [{ uid: 'private-commander-uid', connected: false }] },
  commandAndControl: { status: 'waiting-for-commander', actors: [] },
  forceField: { status: 'not-needed' },
};

it('shows a genuine disconnected choice as pending with server-reconciled presence', () => {
  render(<GmWolfDecisionSummary summary={pending} currentStep="targeting" players={players} available />);
  const region = screen.getByRole('region', { name: 'Current attack choices' });
  expect(region).toHaveTextContent('Wolf Commander');
  expect(region).toHaveTextContent('Choice pending');
  expect(region).toHaveTextContent('Rowan // Reconnect pending');
  expect(region).toHaveTextContent('Presence reflects the last server update.');
  expect(region).toHaveTextContent('Waiting for the Wolf Commander');
  expect(region).not.toHaveTextContent('Unavailable');
  expect(region).not.toHaveTextContent('private-commander-uid');
  expect(within(region).queryByRole('button')).toBeNull();
  expect(within(region).queryByRole('checkbox')).toBeNull();
});

it('explains source-unavailable choices without inventing a disconnected actor', () => {
  render(<GmWolfDecisionSummary summary={{
    commander: { status: 'no-commander', actors: [], reason: 'no-configured-commander' },
    commandAndControl: { status: 'unavailable', actors: [], reason: 'uncharged' },
    forceField: { status: 'unavailable', reason: 'projector-not-ready' },
  }} currentStep="targeting" players={players} available />);
  expect(screen.getByRole('region')).toHaveTextContent('No Wolf Commander configured');
  expect(screen.getByRole('region')).toHaveTextContent('Command and Control is uncharged');
  expect(screen.getByRole('region')).toHaveTextContent('The force-field projector is not ready');
  expect(screen.getByRole('region')).not.toHaveTextContent('Reconnect pending');
});

it('renders the actual Captain target with a printed vessel name', () => {
  render(<GmWolfDecisionSummary summary={{ ...pending,
    forceField: { status: 'selected', actor: { uid: 'private-captain-uid', connected: true }, targetShipId: 'refinery-124' },
  }} currentStep="targeting" players={players} available />);
  expect(screen.getByRole('region')).toHaveTextContent('Gorgoneion Captain');
  expect(screen.getByRole('region')).toHaveTextContent('Protecting Refinery 124');
  expect(screen.getByRole('region')).toHaveTextContent('Ari // Connected at last server update');
});

it('shows current range choices and hit assignment without exposing dice or private composition', () => {
  render(<GmWolfDecisionSummary summary={{ ...pending,
    range: { range: 'medium-range', status: 'targets-required', actors: [{ uid: 'private-eo-uid', connected: true }],
      actionCount: 3, selectedActionCount: 2 },
  }} currentStep="medium-range" players={players} available />);
  const row = screen.getByRole('group', { name: 'Medium Range decisions' });
  expect(row).toHaveTextContent('Hit targets required');
  expect(row).toHaveTextContent('2 selected actions // 3 available');
  expect(row).toHaveTextContent('Mira');
  expect(row).not.toHaveTextContent(/die|rosterIndex|modifier|private-eo-uid/);
});

it('withdraws a range summary that belongs to another stage', () => {
  render(<GmWolfDecisionSummary summary={{ ...pending,
    range: { range: 'long-range', status: 'pending', actors: [{ uid: 'private-eo-uid', connected: false }] },
  }} currentStep="short-range" players={players} available />);
  expect(screen.queryByRole('group', { name: 'Long Range decisions' })).toBeNull();
});

it('shows every current target crew boarding choice and committed security count', () => {
  render(<GmWolfDecisionSummary summary={{ ...pending,
    boarding: { status: 'pending', targets: [
      { targetShipId: 'dione', status: 'pending', actors: [{ uid: 'private-captain-uid', connected: false }], boardingParties: 2 },
      { targetShipId: 'shepherd', status: 'committed', actors: [], boardingParties: 1, securityTeams: 3 },
      { targetShipId: 'quellon', status: 'unavailable', actors: [], boardingParties: 1, reason: 'no-current-crew-actor' },
    ] },
  }} currentStep="boarding" players={players} available />);
  const row = screen.getByRole('group', { name: 'Boarding decisions' });
  expect(row).toHaveTextContent('Dione // Crew choice pending // 2 boarding parties');
  expect(row).toHaveTextContent('Ari // Reconnect pending');
  expect(row).toHaveTextContent('Shepherd // Choice committed // 1 boarding party // 3 security teams');
  expect(row).toHaveTextContent('Quellon // Unavailable // 1 boarding party');
  expect(row).toHaveTextContent('No current entitled crew member');
});

it('withdraws all private choices when the current GM snapshot is unavailable and restores only new data', () => {
  const result = render(<GmWolfDecisionSummary summary={pending} currentStep="targeting" players={players} available />);
  result.rerender(<GmWolfDecisionSummary summary={pending} currentStep="targeting" players={players} available={false} />);
  expect(screen.getByRole('region')).toHaveTextContent('Reconnect for current attack choices.');
  expect(screen.getByRole('region')).not.toHaveTextContent('Rowan');
  result.rerender(<GmWolfDecisionSummary summary={{ ...pending, commander: { status: 'committed', actors: [] } }}
    currentStep="targeting" players={players} available />);
  expect(screen.getByRole('region')).toHaveTextContent('Choice committed');
  expect(screen.getByRole('region')).not.toHaveTextContent('Reconnect pending');
});

it('labels a missing current summary as awaiting refresh and never substitutes an unavailable decision', () => {
  render(<GmWolfDecisionSummary currentStep="targeting" players={players} available />);
  expect(screen.getByRole('region')).toHaveTextContent('Current decision details are waiting for a server refresh.');
  expect(screen.getByRole('region')).not.toHaveTextContent('Unavailable');
});


it('shows the offline EO start-of-attack warhead decision without a facilitator spend control', () => {
  render(<GmWolfDecisionSummary summary={{ ...pending,
    enrichedWarheads: { status: 'pending', actors: [{ uid: 'private-eo-uid', connected: false }] },
  }} currentStep="targeting" players={players} available />);
  const row = screen.getByRole('group', { name: 'Enriched warhead decisions' });
  expect(row).toHaveTextContent('Choice pending');
  expect(row).toHaveTextContent('Mira // Reconnect pending');
  expect(within(row).queryByRole('button')).toBeNull();
});
