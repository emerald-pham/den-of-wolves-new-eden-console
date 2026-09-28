import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { useConsoleAccess } from '@/lib/consoleAccess';
import { normalizeCommandError } from '@/lib/commandErrors';
import { phaseForSession } from '@/lib/turnPhase';
import { drawVipCard, rerollVipUnrest, transferVipCard } from '@/lib/vipCardService';
import type { Player, VipHand } from '@/types/game';

export default function DioneVipCards({
  shipId,
  cycle,
  damaged,
}: {
  readonly shipId: string;
  readonly cycle: {
    readonly step: number; readonly revision: number; readonly charges: readonly string[];
    readonly results?: Readonly<Record<string, string>>;
    readonly unrestRolls?: readonly [number, number]; readonly unrestBeforeCheck?: number;
  } | undefined;
  readonly damaged: boolean;
}) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const fleetGroupId = useSessionStore((state) => state.me?.fleetGroupId);
  const role = useSessionStore((state) => state.me?.role);
  const gmInstanceId = useSessionStore((state) => state.gmInstance?.id);
  const access = useConsoleAccess();
  const [hand, setHand] = useState<VipHand | null>(null);
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [targetUid, setTargetUid] = useState('');
  const [cardId, setCardId] = useState('');
  const [rerollCardId, setRerollCardId] = useState('');
  const [rerollDieIndex, setRerollDieIndex] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setHand(null);
    setPlayers([]);
    setTargetUid('');
    setCardId('');
    setRerollCardId('');
    setRerollDieIndex('');
    if (!session?.id || !me?.uid) {
      return undefined;
    }
    let active = true;
    let unsubscribeHand: () => void = () => undefined;
    let unsubscribePlayers: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeVipCards, subscribeConnectedPlayers }) => {
      if (!active) return;
      unsubscribeHand = subscribeVipCards(session.id, me.uid, (next) => {
        if (active) setHand(next);
      }, () => undefined);
      unsubscribePlayers = subscribeConnectedPlayers(session.id, (next) => {
        if (active) setPlayers(next);
      }, () => undefined);
    });
    return () => {
      active = false;
      unsubscribeHand();
      unsubscribePlayers();
    };
  }, [fleetGroupId, gmInstanceId, me?.sessionId, me?.uid, role, session?.id]);

  const currentPhase = session ? phaseForSession(session) : undefined;
  const coordination = currentPhase?.airspace.state === 'lifted';
  const isDione = shipId === 'dione';
  const availableCards = hand?.cards.filter((card) => card.status === 'available') ?? [];
  const recipients = players.filter((player) => player.uid !== me?.uid && player.role === 'player');
  const drawBlocked = !isDione || !access.writable || pending || !session || !me || connection !== 'live' ||
    session.currentTurn === 0 || coordination || damaged || cycle?.step !== 5 ||
    !cycle.charges.includes('vip-lounge');
  const transferBlocked = !access.writable || pending || !session || !me || connection !== 'live' ||
    session.currentTurn === 0 || !coordination || availableCards.length === 0 || !targetUid || !cardId;
  const rerollOpen = cycle?.step === 4 && cycle.unrestRolls !== undefined &&
    cycle.unrestBeforeCheck !== undefined && cycle.results?.['4'] === undefined;
  const rerollBlocked = !access.writable || pending || !session || !me || connection !== 'live' ||
    session.currentTurn === 0 || coordination || !rerollOpen ||
    !rerollCardId || !availableCards.some(card => card.id === rerollCardId) ||
    (rerollDieIndex !== '0' && rerollDieIndex !== '1');

  async function draw(): Promise<void> {
    if (drawBlocked || !cycle) return;
    setPending(true); setError('');
    try { await drawVipCard(cycle.revision, access.roleId); }
    catch (cause) { setError(normalizeCommandError(cause).message); }
    finally { setPending(false); }
  }

  async function transfer(): Promise<void> {
    if (transferBlocked || !targetUid || !cardId || !hand) return;
    setPending(true); setError('');
    try { await transferVipCard(cardId, targetUid, hand.revision); }
    catch (cause) { setError(normalizeCommandError(cause).message); }
    finally { setPending(false); }
  }

  async function reroll(): Promise<void> {
    if (rerollBlocked || !cycle || (rerollDieIndex !== '0' && rerollDieIndex !== '1')) return;
    setPending(true); setError('');
    try {
      await rerollVipUnrest(shipId, rerollCardId, Number(rerollDieIndex) as 0 | 1,
        cycle.revision, access.roleId);
      setRerollCardId(''); setRerollDieIndex('');
    } catch (cause) { setError(normalizeCommandError(cause).message); }
    finally { setPending(false); }
  }

  const showDioneDraw = isDione && Boolean(cycle?.charges.includes('vip-lounge'));
  if (!showDioneDraw && !hand?.cards.length) return null;

  return <section className="dione-vip-cards cic-frame" aria-label="Dione VIP cards">
    <p className="ship-resources__eyebrow">VIP Lounge // private card hand</p>
    <p>Only your signed-in player can read these cards. {isDione
      ? 'The charged K♣ Lounge draws one of the nine named cards during maintenance step 5.'
      : 'Your active console keeps this private hand available across ships.'}</p>
    {error && <p role="alert">{error}</p>}
    {showDioneDraw && <>
      <button className="cic-action-button" type="button" disabled={drawBlocked} onClick={() => void draw()}>
        {pending ? 'Drawing…' : 'Draw private VIP card'}
      </button>
      {damaged && <p role="status">VIP Lounge damaged // cannot be charged or used.</p>}
    </>}
    {hand?.cards.length ? <ul aria-label="Your private VIP cards">
      {hand.cards.map((card) => <li key={card.id}>
        <strong>{card.name}</strong> <span>// {card.status === 'spent' ? 'SPENT' : 'UNSPENT'}</span>
      </li>)}
    </ul> : <p role="status">No private VIP cards are currently held.</p>}
    <p>Cards are single-use and transferable during Coordination. Discard one during an open unrest check to reroll one of its server dice before the riot check.</p>
    {rerollOpen && availableCards.length > 0 && <fieldset className="maintenance-controls">
      <legend>VIP unrest reroll</legend>
      <p>Die 1: {cycle.unrestRolls?.[0]} // Die 2: {cycle.unrestRolls?.[1]}. The resulting unrest check replaces only the chosen die.</p>
      <label>VIP card to discard
        <select aria-label="VIP card to discard" value={rerollCardId}
          onChange={event => setRerollCardId(event.target.value)}>
          <option value="">Choose a card</option>
          {availableCards.map(card => <option key={card.id} value={card.id}>{card.name}</option>)}
        </select>
      </label>
      <label>Unrest die to reroll
        <select aria-label="Unrest die to reroll" value={rerollDieIndex}
          onChange={event => setRerollDieIndex(event.target.value)}>
          <option value="">Choose a die</option>
          <option value="0">Die 1 // {cycle.unrestRolls?.[0]}</option>
          <option value="1">Die 2 // {cycle.unrestRolls?.[1]}</option>
        </select>
      </label>
      <button className="cic-action-button" type="button" disabled={rerollBlocked}
        onClick={() => void reroll()}>Discard card and reroll one die</button>
    </fieldset>}
    {coordination && availableCards.length > 0 && <fieldset className="maintenance-controls">
      <legend>Transfer a VIP card</legend>
      <label>Card
        <select aria-label="VIP card to transfer" value={cardId} onChange={(event) => setCardId(event.target.value)}>
          <option value="">Choose a card</option>
          {availableCards.map((card) => <option key={card.id} value={card.id}>{card.name}</option>)}
        </select>
      </label>
      <label>Recipient
        <select aria-label="VIP card recipient" value={targetUid} onChange={(event) => setTargetUid(event.target.value)}>
          <option value="">Choose a connected player</option>
          {recipients.map((player) => <option key={player.uid} value={player.uid}>{player.displayName}</option>)}
        </select>
      </label>
      <button className="cic-action-button" type="button" disabled={transferBlocked} onClick={() => void transfer()}>
        {pending ? 'Transferring…' : 'Transfer card'}
      </button>
    </fieldset>}
  </section>;
}
