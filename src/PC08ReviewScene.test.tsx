import {fireEvent, render, screen, within} from '@testing-library/react';
import {expect, it, vi} from 'vitest';
import PC08ReviewScene from './PC08ReviewScene';
import {useSessionStore} from '@/store/useSessionStore';

vi.mock('./components/ContactPlot', () => ({default: ({contacts, centerDockedCraftTags}: {
  contacts: {tag: string; dockedCraftTags?: readonly string[]}[]; centerDockedCraftTags?: readonly string[];
}) => <div>
  <div aria-label="Origin craft">{centerDockedCraftTags?.map(tag => <span key={tag}>{tag}</span>)}</div>
  {contacts.map(contact => <div key={contact.tag} aria-label={contact.tag}><span>{contact.tag}</span>
    {contact.dockedCraftTags?.map(tag => <span key={tag}>{tag}</span>)}</div>)}
</div>}));

it('offers five keyboard-accessible checks and a visible route to the station chooser', () => {
  render(<PC08ReviewScene />);
  expect(screen.getByRole('note', {name: 'Prepared review boundary'})).toHaveTextContent('No live session writes');
  const navigation = screen.getByRole('navigation', {name: 'PC08 review steps'});
  expect(within(navigation).getAllByRole('button')).toHaveLength(5);
  for (const button of within(navigation).getAllByRole('button')) {
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  fireEvent.click(screen.getByRole('button', {name: 'Previous review step'}));
  expect(within(navigation).getByRole('button', {name: '4 Boarding defence'})).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('link', {name: 'Return to station and console chooser'})).toHaveAttribute('href', '/#/');
});

it('uses the real range presenter for local use, target assignment and damaged-action denial', () => {
  render(<PC08ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '2 Weapons'}));
  fireEvent.click(screen.getByRole('checkbox', {name: 'Missile launchers'}));
  fireEvent.click(screen.getByRole('button', {name: 'Use selected actions'}));
  fireEvent.change(screen.getByRole('combobox', {name: 'Missile launchers hit 1'}), {target: {value: 'local-contact-1'}});
  fireEvent.click(screen.getByRole('button', {name: 'Commit target assignments'}));
  expect(screen.getByRole('status', {name: 'Prepared weapon result'})).toHaveTextContent('LOCAL SIMULATION');
  expect(screen.getByRole('status', {name: 'Prepared weapon result'})).toHaveTextContent('committed');
  fireEvent.click(screen.getByRole('button', {name: 'Damaged weapon sample'}));
  expect(screen.queryByRole('checkbox', {name: 'Missile launchers'})).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Use selected actions'})).toBeDisabled();
});

it('shows committed boarding through the real crew presenter without accepting a second local choice', () => {
  render(<PC08ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '4 Boarding defence'}));
  const choices = screen.getByRole('combobox', {name: 'Security Teams committed'});
  fireEvent.change(choices, {target: {value: '2'}});
  fireEvent.click(screen.getByRole('button', {name: 'Commit defence'}));
  expect(screen.getByRole('status', {name: 'Prepared boarding result'})).toHaveTextContent('2 Security Teams');
  expect(screen.queryByRole('button', {name: 'Commit defence'})).not.toBeInTheDocument();
});

it('uses independent real launch controls and one genuine Medium choice per fighter', () => {
  render(<PC08ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '3 Fleet fighters'}));
  expect(screen.getByRole('button', {name: 'Show Short Range loss sample'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Launch Fighter Wing Alpha'}));
  expect(screen.getByRole('button', {name: 'Launch Fighter Wing Alpha'})).toBeDisabled();
  expect(screen.getByRole('button', {name: 'Launch Fighter Wing Bravo'})).toBeEnabled();
  const resolve = screen.getByRole('button', {name: 'Resolve Medium actions'});
  expect(resolve).toBeDisabled();
  for (let fighter = 1; fighter <= 4; fighter++) {
    fireEvent.change(screen.getByRole('combobox', {name: `Fighter ${fighter} action`}), {target: {value: fighter === 1 ? 'target-shift' : 'attack'}});
    fireEvent.change(screen.getByRole('combobox', {name: `Fighter ${fighter} target`}), {target: {value: 'local-wolf-1'}});
    if (fighter === 1) fireEvent.change(screen.getByRole('combobox', {name: 'Fighter 1 shift'}), {target: {value: '1'}});
  }
  fireEvent.click(resolve);
  expect(screen.getByRole('status', {name: 'Prepared fighter result'})).toHaveTextContent('Alpha choice committed');
  fireEvent.click(screen.getByRole('button', {name: 'Bravo sample'}));
  expect(screen.getByText('This wing did not launch for the current attack.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'Short Range sample'}));
  expect(screen.getByRole('button', {name: 'Show Short Range loss sample'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Launch Fighter Wing Bravo'}));
  expect(screen.getByRole('button', {name: 'Show Short Range loss sample'})).toBeEnabled();
});

it('presents actual Commander, support, Militia, independent reroll and ruling choices as isolated samples', () => {
  render(<PC08ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '4 Boarding defence'}));
  fireEvent.click(screen.getByRole('button', {name: 'Commander sample'}));
  fireEvent.click(screen.getByRole('button', {name: /lead at aegis/i}));
  expect(screen.getByRole('status', {name: 'Prepared boarding result'})).toHaveTextContent('two parties');
  fireEvent.click(screen.getByRole('button', {name: 'Support sample'}));
  fireEvent.click(screen.getByRole('button', {name: /move pallas to dione/i}));
  expect(screen.getByRole('status', {name: 'Prepared boarding result'})).toHaveTextContent('Pallas');
  fireEvent.click(screen.getByRole('button', {name: 'Militia sample'}));
  fireEvent.click(screen.getByRole('checkbox', {name: 'Roll two dice per Security Team'}));
  fireEvent.change(screen.getByRole('combobox', {name: 'Front-line dice'}), {target: {value: '2'}});
  fireEvent.click(screen.getByRole('button', {name: 'Commit defence'}));
  expect(screen.getByRole('status', {name: 'Prepared boarding result'})).toHaveTextContent('2 front-line');
  for (const source of ['AEGIS', 'Pallas']) {
    fireEvent.click(screen.getByRole('button', {name: `${source} reroll sample`}));
    fireEvent.click(screen.getByRole('checkbox', {name: /aegis die 1: 1/i}));
    fireEvent.click(screen.getByRole('button', {name: 'Reroll selected dice'}));
    expect(screen.getByRole('status', {name: 'Prepared boarding result'})).toHaveTextContent(`${source} chose 1`);
  }
  fireEvent.click(screen.getByRole('button', {name: 'Ruling sample'}));
  expect(screen.getByRole('button', {name: 'Record facilitator ruling'})).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', {name: 'Facilitator ruling'}), {target: {value: 'Recorded prepared adjudication.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Record facilitator ruling'}));
  expect(screen.getByRole('status', {name: 'Prepared boarding result'})).toHaveTextContent('LOCAL SIMULATION');
});

it('preserves the selected Short Range fighters and a separate zero-fighter pass', () => {
  render(<PC08ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '3 Fleet fighters'}));
  fireEvent.click(screen.getByRole('button', {name: 'Launch Fighter Wing Alpha'}));
  fireEvent.click(screen.getByRole('button', {name: 'Short Range sample'}));
  fireEvent.click(screen.getByRole('checkbox', {name: 'Fighter 1 Short attack'}));
  fireEvent.click(screen.getByRole('checkbox', {name: 'Fighter 3 Short attack'}));
  fireEvent.click(screen.getByRole('button', {name: 'Resolve selected Short attacks'}));
  expect(screen.getByRole('status', {name: 'Prepared fighter result'}))
    .toHaveTextContent('Alpha Short Range choice committed: fighters 1, 3 selected.');
  fireEvent.click(screen.getByRole('button', {name: 'PDF Escort Wing sample'}));
  fireEvent.click(screen.getByRole('button', {name: 'Launch PDF Escort Wing'}));
  fireEvent.click(screen.getByRole('button', {name: 'Pass Short Range'}));
  expect(screen.getByRole('status', {name: 'Prepared fighter result'}))
    .toHaveTextContent('PDF Escort Wing passed Short Range.');
});

it('retains committed results through offline and reconnect samples', () => {
  render(<PC08ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '5 Results and recovery'}));
  const result = screen.getByRole('region', {name: 'Wolf attack status'});
  expect(result).toHaveTextContent('Attack complete');
  fireEvent.click(screen.getByRole('button', {name: 'Offline sample'}));
  expect(result).toHaveTextContent('Attack complete');
  expect(screen.getByRole('status', {name: 'Prepared recovery result'})).toHaveTextContent('preserved');
  fireEvent.click(screen.getByRole('button', {name: 'Reconnect sample'}));
  expect(result).toHaveTextContent('Attack complete');
  expect(screen.getByRole('status', {name: 'Prepared recovery result'})).toHaveTextContent('same committed');
});

it('retains the actual prepared pass, stay and ruling rather than a preset chosen outcome', () => {
  render(<PC08ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '4 Boarding defence'}));
  fireEvent.click(screen.getByRole('button', {name: 'Commander sample'}));
  fireEvent.click(screen.getByRole('button', {name: 'Do not lead'}));
  expect(screen.getByRole('region', {name: 'Wolf Commander boarding leadership'})).toHaveTextContent('The Commander passed.');
  fireEvent.click(screen.getByRole('button', {name: 'Support sample'}));
  fireEvent.click(screen.getByRole('button', {name: 'Stay at Aegis'}));
  expect(screen.getByRole('region', {name: 'Pallas boarding relocation'})).toHaveTextContent('stayed docked at Aegis');
  fireEvent.click(screen.getByRole('button', {name: 'Ruling sample'}));
  fireEvent.change(screen.getByRole('textbox', {name: 'Facilitator ruling'}), {target: {value: 'Keep this exact prepared ruling.'}});
  fireEvent.click(screen.getByRole('button', {name: 'Record facilitator ruling'}));
  expect(screen.getByRole('region', {name: 'Facilitator ruling for destroyed Commander-led parties'})).toHaveTextContent('Keep this exact prepared ruling.');
});

it('retains Chepu stay independently while Pallas can still make its own support choice', () => {
  render(<PC08ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '4 Boarding defence'}));
  fireEvent.click(screen.getByRole('button', {name: 'Support sample'}));
  const chepu = screen.getByRole('region', {name: 'Chepu boarding relocation'});
  fireEvent.click(within(chepu).getByRole('button', {name: 'Stay at Refinery 124'}));
  expect(chepu).toHaveTextContent('stayed docked at Refinery 124');
  expect(within(chepu).queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Move Pallas to Dione'})).toBeEnabled();
});

it('keeps every prepared interaction isolated from the current signed-in identity and session store', () => {
  const original = useSessionStore.getState();
  const me = {uid: 'existing-gm', sessionId: 'existing-session', displayName: 'Existing facilitator',
    role: 'gm' as const, seatId: null, joinedAt: '2026-10-03T12:00:00.000Z'};
  const instance = {id: 'existing-instance', sessionId: me.sessionId, uid: me.uid,
    name: 'Existing console', deviceLabel: 'Existing device', claimedAt: me.joinedAt};
  useSessionStore.setState({me, gmInstance: instance});
  try {
    render(<PC08ReviewScene />);
    expect(screen.queryByRole('button', {name: 'Trigger unknown contact'})).not.toBeInTheDocument();
    for (const label of ['2 Weapons', '3 Fleet fighters', '4 Boarding defence', '5 Results and recovery']) {
      fireEvent.click(screen.getByRole('button', {name: label}));
    }
    fireEvent.click(screen.getByRole('button', {name: 'Offline sample'}));
    fireEvent.click(screen.getByRole('button', {name: 'Reconnect sample'}));
    expect(useSessionStore.getState().session).toBe(original.session);
    expect(useSessionStore.getState().me).toBe(me);
    expect(useSessionStore.getState().gmInstance).toBe(instance);
  } finally {
    useSessionStore.setState(original);
  }
});


it('retains independent launch or pass decisions through the actual Alpha, Bravo, PDF and Maliades presenters', () => {
  render(<PC08ReviewScene />);
  fireEvent.click(screen.getByRole('button', {name: '3 Fleet fighters'}));
  fireEvent.click(screen.getByRole('button', {name: 'Pass Fighter Wing Alpha'}));
  expect(screen.getByRole('article', {name: 'Fighter Wing Alpha'})).toHaveTextContent('Launch choice passed');
  expect(screen.getByRole('button', {name: 'Launch Fighter Wing Alpha'})).toBeDisabled();
  expect(screen.getByRole('button', {name: 'Launch Fighter Wing Bravo'})).toBeEnabled();
  fireEvent.click(screen.getByRole('button', {name: 'PDF Escort Wing sample'}));
  fireEvent.click(screen.getByRole('button', {name: 'Pass PDF Escort Wing'}));
  expect(screen.getByLabelText('PDF Escort Wing launch control')).toHaveTextContent('Launch choice passed');
  expect(screen.getByRole('button', {name: 'Launch PDF Escort Wing'})).toBeDisabled();
  expect(screen.getByRole('button', {name: 'Show Short Range loss sample'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Maliades sample'}));
  fireEvent.click(screen.getByRole('button', {name: 'Short Range sample'}));
  expect(screen.getByRole('button', {name: 'Show Short Range loss sample'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Launch Maliades'}));
  expect(screen.getByRole('button', {name: 'Show Short Range loss sample'})).toBeEnabled();
  for (let damage = 1; damage <= 3; damage++) {
    fireEvent.click(screen.getByRole('button', {name: 'Show Short Range loss sample'}));
    expect(screen.getByRole('region', {name: 'Prepared Maliades condition'})).toHaveTextContent(`${damage}/3 damage`);
  }
  expect(screen.getByRole('button', {name: 'Show Short Range loss sample'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button', {name: 'Bravo sample'}));
  expect(screen.getByRole('button', {name: 'Launch Fighter Wing Bravo'})).toBeEnabled();
});


it('feeds truthful docked, travelling, parked and rejoined craft into the real plot adapter', () => {
  render(<PC08ReviewScene />);
  const origin = screen.getByLabelText('Origin craft');
  expect(origin).toHaveTextContent('DOCKED // STARLIGHT');
  expect(origin).toHaveTextContent('DOCKED // FIGHTER WING ALPHA');
  expect(origin).toHaveTextContent('DOCKED // FIGHTER WING BRAVO');
  fireEvent.click(screen.getByRole('button', {name: 'travelling sample'}));
  expect(screen.queryByText('DOCKED // STARLIGHT')).not.toBeInTheDocument();
  expect(screen.getByText('STARLIGHT')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', {name: 'parked sample'}));
  expect(screen.getByLabelText('ICEBREAKER')).toHaveTextContent('DOCKED // STARLIGHT');
  expect(origin).not.toHaveTextContent('DOCKED // STARLIGHT');
  fireEvent.click(screen.getByRole('button', {name: 'rejoined sample'}));
  expect(screen.getByLabelText('DIONE')).toHaveTextContent('DOCKED // MALIADES');
  fireEvent.click(screen.getByRole('button', {name: 'Cached connection sample'}));
  expect(screen.getByLabelText('Origin craft')).toBeEmptyDOMElement();
  expect(screen.queryAllByText(/^DOCKED \/\//)).toHaveLength(0);
});
