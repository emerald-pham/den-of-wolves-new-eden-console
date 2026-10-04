import { useEffect, useMemo, useState } from 'react';
import {
  createWolfAmnestyOffer,
  getWolfAmnestyView,
  publishWolfCommanderAddress,
  recordWolfAmnestyConsequence,
  respondToWolfAmnesty,
  type WolfAmnestyOfferView,
  type WolfAmnestyView,
} from '@/lib/sessionService';
import { SHIPS } from '@/data/ships';
import { useSessionStore } from '@/store/useSessionStore';
import './WolfCommanderAmnestyPanels.css';

const CONDITION_TEXT = 'Surrender by medium jump to 0101.';

function usePrivateAmnestyView(enabled: boolean) {
  const sessionId = useSessionStore((state) => state.session?.id ?? null);
  const cycle = useSessionStore((state) => state.session?.currentTurn ?? 0);
  const uid = useSessionStore((state) => state.me?.uid ?? null);
  const [view, setView] = useState<WolfAmnestyView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    setView(null);
    setError(null);
    if (!enabled || !sessionId || !uid) return;
    let live = true;
    setLoading(true);
    void getWolfAmnestyView().then((next) => {
      const current = useSessionStore.getState();
      if (!live || current.session?.id !== sessionId || current.me?.uid !== uid) return;
      setView(next);
    }).catch((cause: unknown) => {
      const current = useSessionStore.getState();
      if (!live || current.session?.id !== sessionId || current.me?.uid !== uid) return;
      setError(cause instanceof Error ? cause.message : 'The private amnesty view is unavailable.');
    }).finally(() => {
      if (live) setLoading(false);
    });
    return () => { live = false; };
  }, [enabled, sessionId, cycle, uid, refreshToken]);

  return {
    view, setView, loading, error, setError,
    refresh: () => setRefreshToken((value) => value + 1),
  };
}

function OfferDetails({ offer }: { readonly offer: WolfAmnestyOfferView }) {
  return (
    <dl className="wolf-amnesty__details">
      <div><dt>Target ship</dt><dd>{shipName(offer.targetShipId)}</dd></div>
      <div><dt>Condition</dt><dd>{CONDITION_TEXT}</dd></div>
      <div><dt>Response due</dt><dd><time dateTime={offer.responseDeadline}>{formatDeadline(offer.responseDeadline)}</time></dd></div>
      <div><dt>Offer status</dt><dd>{statusLabel(offer)}</dd></div>
    </dl>
  );
}

/** Commander-only address and offer controls backed by current server authority. */
export function WolfCommanderAddressAmnestyPanel() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const commander = Boolean(session && me?.role === 'player' && me.replacementRoleId === 'wolf-commander' &&
    me.replacementStatus == null);
  const { view, setView, loading, error: loadError, setError: setLoadError, refresh } = usePrivateAmnestyView(commander);
  const [message, setMessage] = useState('');
  const [targetShipId, setTargetShipId] = useState('');
  const [deadlineMinutes, setDeadlineMinutes] = useState(10);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentCycle = session?.currentTurn ?? 0;
  const activeShips = useMemo(() => SHIPS.filter((ship) =>
    (session?.activeVesselIds ?? []).includes(ship.id)), [session?.activeVesselIds]);
  const addressPublished = view?.commanderAddressPublished ?? false;
  const offer = view?.offer ?? null;

  if (!commander) return null;

  async function publish(): Promise<void> {
    if (busy || addressPublished || !message.trim() || currentCycle < 1) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await publishWolfCommanderAddress(message, currentCycle);
      setView((current) => current ? { ...current, commanderAddressPublished: true } : current);
      setNotice(`Fleet address published for 30 seconds // expires ${formatDeadline(result.expiresAt)}.`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The fleet address could not be published.');
    } finally {
      setBusy(false);
    }
  }

  async function offerAmnesty(): Promise<void> {
    if (busy || !addressPublished || !targetShipId || currentCycle < 1) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await createWolfAmnestyOffer(targetShipId, currentCycle, deadlineMinutes);
      setView((current) => current ? {
        ...current,
        offer: {
          type: 'wolf-amnesty-offer', offerId: result.offerId, cycle: result.cycle,
          revision: result.revision, targetShipId: result.targetShipId,
          condition: result.condition, responseDeadline: result.responseDeadline,
          status: result.status,
        },
      } : current);
      setNotice('Amnesty offer sent to the target ship captain. The facilitator must rule on any consequence.');
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The amnesty offer could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="wolf-amnesty cic-frame" aria-labelledby="wolf-amnesty-commander-title">
      <header className="wolf-amnesty__header">
        <div><p className="eyebrow">Private Commander authority</p><h2 id="wolf-amnesty-commander-title">Commander address and amnesty</h2></div>
        <span>Cycle {currentCycle}</span>
      </header>
      <p className="wolf-amnesty__copy">
        Address the fleet during Team Phase for up to 30 seconds. An amnesty offer states the printed surrender condition and a response deadline; it does not decide the bargain.
      </p>
      {loading && <p role="status">Loading current address and amnesty state…</p>}
      {!addressPublished && (
        <div className="wolf-amnesty__form">
          <label className="wolf-amnesty__field">
            Fleet address
            <textarea value={message} maxLength={1000} disabled={busy}
              onChange={(event) => setMessage(event.currentTarget.value)} />
          </label>
          <button className="cic-action-button cic-action-button--confirm" type="button"
            disabled={busy || loading || message.trim().length === 0}
            onClick={() => void publish()}>
            {busy ? 'Publishing fleet address…' : 'Address fleet for 30 seconds'}
          </button>
        </div>
      )}
      {addressPublished && <p className="wolf-amnesty__status" role="status">
        {notice ?? 'The fleet has been addressed this cycle. You may now issue a private amnesty offer.'}
      </p>}
      {addressPublished && (
        <div className="wolf-amnesty__form">
          <label className="wolf-amnesty__field">
            Target ship
            <select value={targetShipId} disabled={busy || activeShips.length === 0}
              onChange={(event) => setTargetShipId(event.currentTarget.value)}>
              <option value="">Select an active ship</option>
              {activeShips.map((ship) => <option key={ship.id} value={ship.id}>{ship.name}</option>)}
            </select>
          </label>
          <label className="wolf-amnesty__field">
            Response deadline
            <select value={deadlineMinutes} disabled={busy}
              onChange={(event) => setDeadlineMinutes(Number(event.currentTarget.value))}>
              <option value={5}>5 minutes</option><option value={10}>10 minutes</option>
              <option value={30}>30 minutes</option><option value={60}>1 hour</option>
            </select>
          </label>
          <p className="wolf-amnesty__condition">Condition // {CONDITION_TEXT}</p>
          <button className="cic-action-button" type="button"
            disabled={busy || loading || !targetShipId || Boolean(offer && isUnresolved(offer))}
            onClick={() => void offerAmnesty()}>
            {busy ? 'Sending amnesty offer…' : 'Offer amnesty'}
          </button>
        </div>
      )}
      {offer && <section className="wolf-amnesty__offer" aria-label="Current private amnesty offer">
        <h3>Current amnesty offer</h3>
        <OfferDetails offer={offer} />
        {offer.response && <p>Captain response // {offer.response}</p>}
        {offer.ruling && <p>Facilitator consequence // {offer.ruling}</p>}
      </section>}
      {(loadError || actionError) && <p role="alert">{actionError ?? loadError}</p>}
      <button className="cic-text-button" type="button" disabled={busy} onClick={() => {
        setActionError(null); setLoadError(null); setNotice(null); refresh();
      }}>Refresh address and amnesty</button>
    </section>
  );
}

/** Target captain's private response control. The callable rechecks exact ship authority. */
export function WolfAmnestyCaptainPanel({ shipId }: { readonly shipId: string }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const roleId = shipId === 'aegis' ? 'admiral' : `${shipId}-captain`;
  const captain = Boolean(session && me?.role === 'player' && me.replacementStatus == null &&
    (me.replacementRoleId === roleId || me.assignedRoleId === roleId));
  const { view, setView, loading, error, setError, refresh } = usePrivateAmnestyView(captain);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const offer = view?.offer?.targetShipId === shipId ? view.offer : null;
  const expired = Boolean(offer && now > Date.parse(offer.responseDeadline));

  if (!captain) return null;

  async function respond(answer: 'accept' | 'decline'): Promise<void> {
    if (!offer || offer.status !== 'offered' || expired || busy) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await respondToWolfAmnesty(offer.revision, answer);
      setView((current) => current?.offer ? {
        ...current,
        offer: {
          ...current.offer, revision: result.revision, status: result.status,
          ...(result.response ? { response: result.response } : {}),
        },
      } : current);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Your amnesty response could not be recorded.');
    } finally {
      setBusy(false);
      setNow(Date.now());
    }
  }

  return (
    <section className="wolf-amnesty cic-frame" aria-labelledby="wolf-amnesty-captain-title">
      <header className="wolf-amnesty__header">
        <div><p className="eyebrow">Private ship authority</p><h2 id="wolf-amnesty-captain-title">Wolf amnesty offer</h2></div>
      </header>
      {loading && <p role="status">Checking for a private offer to {shipName(shipId)}…</p>}
      {!loading && !offer && <p className="wolf-amnesty__status" role="status">No private offer is addressed to this ship.</p>}
      {offer && <>
        <p className="wolf-amnesty__copy">The Wolf Commander has made this explicit offer. Your answer records your response only; accepting does not decide the ship's fate.</p>
        <OfferDetails offer={offer} />
        {offer.status === 'offered' && !expired && <div className="wolf-amnesty__actions">
          <button className="cic-action-button cic-action-button--confirm" type="button" disabled={busy}
            onClick={() => void respond('accept')}>Accept offer</button>
          <button className="cic-action-button" type="button" disabled={busy}
            onClick={() => void respond('decline')}>Decline offer</button>
        </div>}
        {offer.status === 'offered' && expired && <p className="wolf-amnesty__status" role="status">
          The response deadline passed without a recorded answer. The facilitator must decide what follows.
        </p>}
        {offer.status === 'accepted-pending-facilitator' && <p className="wolf-amnesty__status" role="status">
          Your acceptance is recorded, awaiting facilitator ruling on the consequence. Your answer does not decide the outcome.
        </p>}
        {offer.status === 'declined' && <p className="wolf-amnesty__status" role="status">Your decline is recorded.</p>}
        {offer.status === 'facilitator-ruled' && offer.ruling && <p className="wolf-amnesty__status" role="status">
          Facilitator consequence // {offer.ruling}
        </p>}
      </>}
      {(error || actionError) && <p role="alert">{actionError ?? error}</p>}
      <button className="cic-text-button" type="button" disabled={busy} onClick={() => {
        setNow(Date.now()); setActionError(null); setError(null); refresh();
      }}>Refresh amnesty offer</button>
    </section>
  );
}

/** Facilitator-only ruling control for accepted or unanswered expired offers. */
export function GmWolfAmnestyPanel() {
  const me = useSessionStore((state) => state.me);
  const instance = useSessionStore((state) => state.gmInstance);
  const gm = Boolean(me?.role === 'gm' && instance && instance.sessionId === me.sessionId && instance.uid === me.uid);
  const { view, setView, loading, error, setError, refresh } = usePrivateAmnestyView(gm);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const offer = view?.offer ?? null;
  const unansweredExpired = Boolean(offer && offer.status === 'offered' && now > Date.parse(offer.responseDeadline));
  const mayRule = Boolean(offer && (offer.status === 'accepted-pending-facilitator' || unansweredExpired));

  if (!gm) return null;

  async function record(): Promise<void> {
    if (!offer || !mayRule || busy || !text.trim()) return;
    setBusy(true);
    setActionError(null);
    try {
      const result = await recordWolfAmnestyConsequence(offer.revision, text);
      setView((current) => current?.offer ? {
        ...current, offer: {
          ...current.offer, revision: result.revision, status: result.status,
          ...(result.ruling ? { ruling: result.ruling } : {}),
        },
      } : current);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The facilitator consequence could not be saved.');
    } finally {
      setBusy(false);
      setNow(Date.now());
    }
  }

  return (
    <section className="wolf-amnesty cic-frame" aria-labelledby="wolf-amnesty-gm-title">
      <header className="wolf-amnesty__header">
        <div><p className="eyebrow">Private facilitator record</p><h2 id="wolf-amnesty-gm-title">Facilitator amnesty ruling</h2></div>
      </header>
      {loading && <p role="status">Loading private amnesty record…</p>}
      {!loading && !offer && <p className="wolf-amnesty__status" role="status">No current amnesty offer needs a ruling.</p>}
      {offer && <>
        <OfferDetails offer={offer} />
        {offer.status === 'offered' && !unansweredExpired && <p className="wolf-amnesty__status" role="status">
          Awaiting the target captain's response. No response or consequence is applied automatically.
        </p>}
        {unansweredExpired && <p className="wolf-amnesty__status" role="status">
          No response before the deadline. A facilitator ruling is required; no bargain was decided automatically.
        </p>}
        {offer.response && <p>Captain response // {offer.response}</p>}
        {offer.ruling && <p className="wolf-amnesty__status" role="status">Facilitator consequence // {offer.ruling}</p>}
        {mayRule && <div className="wolf-amnesty__form">
          <label className="wolf-amnesty__field">
            Facilitator consequence
            <textarea value={text} maxLength={2000} disabled={busy}
              onChange={(event) => setText(event.currentTarget.value)} />
          </label>
          <button className="cic-action-button cic-action-button--confirm" type="button"
            disabled={busy || text.trim().length === 0} onClick={() => void record()}>
            {busy ? 'Recording facilitator consequence…' : 'Record facilitator consequence'}
          </button>
        </div>}
      </>}
      {(error || actionError) && <p role="alert">{actionError ?? error}</p>}
      <button className="cic-text-button" type="button" disabled={busy} onClick={() => {
        setNow(Date.now()); setActionError(null); setError(null); refresh();
      }}>Refresh amnesty record</button>
    </section>
  );
}

function isUnresolved(offer: WolfAmnestyOfferView): boolean {
  return offer.status === 'offered' || offer.status === 'accepted-pending-facilitator';
}

function shipName(shipId: string): string {
  return SHIPS.find((ship) => ship.id === shipId)?.name ?? shipId;
}

function formatDeadline(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : value;
}

function statusLabel(offer: WolfAmnestyOfferView): string {
  switch (offer.status) {
    case 'offered': return 'Awaiting captain response';
    case 'accepted-pending-facilitator': return 'Accepted // facilitator ruling pending';
    case 'declined': return 'Declined';
    case 'facilitator-ruled': return 'Facilitator ruling recorded';
  }
}
