import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { useConsoleAccess } from '@/lib/consoleAccess';
import { normalizeCommandError } from '@/lib/commandErrors';
import { phaseForSession } from '@/lib/turnPhase';
import { drawVipCard, transferVipCard } from '@/lib/vipCardService';
import type { Player, VipHand } from '@/types/game';

export default function DioneVipCards({
  shipId,
  cycle,
  damaged,
}: {
  readonly shipId: string;
  readonly cycle: { readonly step: number; readonly revision: number; readonly charges: readonly string[] } | undefined;
  readonly damaged: boolean;
}) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const access = useConsoleAccess();
  const [hand, setHand] = useState<VipHand | null>(null);
  const [players, setPlayers] = useState<readonly Player[]>([]);
  const [targetUid, setTargetUid] = useState('');
  const [cardId, setCardId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session?.id || !me?.uid) {
      setHand(null);
      setPlayers([]);
      return undefined;
    }
    let active = true;
    let unsubscribeHand: () => void = () => undefined;
    let unsubscribePlayers: () => void = () => undefined;
    void import('@/lib/firestore').then(({ subscribeVipCards, subscribeConnectedPlayers }) => {
      if (!active) return;
      unsubscribeHand = subscribeVipCards(session.id, me.uid, setHand, () => undefined);
      unsubscribePlayers = subscribeConnectedPlayers(session.id, setPlayers, () => undefined);
    });
    return () => {
      active = false;
      unsubscribeHand();
      unsubscribePlayers();
    };
  }, [me?.uid, session?.id]);

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
    <p>Cards are single-use and transferable during Coordination. Prompt 191 owns the printed effect: discard a card to reroll one die during an unrest check in maintenance step 3. That use action is not available yet.</p>
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
