import { useEffect, useMemo, useRef, useState } from 'react';
import {
  acceptSameTableTradeOffer,
  createSameTableTradeOffer,
  subscribeSameTableTradeInventory,
  subscribeSameTableTradeOffers,
  type SameTableTradeInventoryView,
  type SameTableTradeOfferView,
  type SameTableTradeOffersView,
} from '@/lib/sameTableTradeService';
import { SameTableTradePanel, type SameTableTradeParticipant } from './SameTableTradePanel';

interface SameTableTradeWorkspaceProps {
  readonly sessionId: string;
  readonly currentPlayerUid: string;
  readonly currentPlayerName: string;
  readonly fleetGroupId: string;
  readonly counterparties: readonly SameTableTradeParticipant[];
}

interface OfferAttempt {
  readonly signature: string;
  readonly offerId: string;
}

function safeRequestId(): string {
  if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
    throw new Error('This browser cannot create a secure trade request identity.');
  }
  return crypto.randomUUID();
}

function participantName(
  offers: readonly SameTableTradeOfferView[],
  counterparties: readonly SameTableTradeParticipant[],
  direction: 'incoming' | 'outgoing',
) {
  const uidFor = direction === 'incoming'
    ? (offer: SameTableTradeOfferView) => offer.fromUid
    : (offer: SameTableTradeOfferView) => offer.toUid;
  const names = new Map(counterparties.map((player) => [player.id, player.name]));
  return offers.map((offer) => ({
    id: offer.id,
    participantName: names.get(uidFor(offer)) ?? 'A crew member',
    amounts: offer.quantities,
    ...(direction === 'outgoing' ? {
      statusLabel: offer.status === 'accepted' ? 'Accepted' : 'Waiting for recipient',
    } : {}),
  }));
}

export default function SameTableTradeWorkspace({
  sessionId,
  currentPlayerUid,
  currentPlayerName,
  fleetGroupId,
  counterparties,
}: SameTableTradeWorkspaceProps) {
  const [inventory, setInventory] = useState<SameTableTradeInventoryView | null>(null);
  const [inventoryLoaded, setInventoryLoaded] = useState(false);
  const [offers, setOffers] = useState<SameTableTradeOffersView>({ incoming: [], outgoing: [] });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offersUnavailable, setOffersUnavailable] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [pendingOfferId, setPendingOfferId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const requestInFlight = useRef(false);
  const offerAttempt = useRef<OfferAttempt | null>(null);

  useEffect(() => {
    setInventory(null);
    setInventoryLoaded(false);
    setOffers({ incoming: [], outgoing: [] });
    setErrorMessage(null);
    setOffersUnavailable(false);
    setStatusMessage(null);
    const stopInventory = subscribeSameTableTradeInventory(
      sessionId,
      currentPlayerUid,
      (next) => {
        setInventory(next);
        setInventoryLoaded(true);
        setErrorMessage(null);
      },
      () => {
        setInventory(null);
        setInventoryLoaded(true);
        setErrorMessage('Your private counts are unavailable. Reconnect before trading.');
      },
    );
    const stopOffers = subscribeSameTableTradeOffers(
      sessionId,
      currentPlayerUid,
      fleetGroupId,
      setOffers,
      () => {
        setOffers({ incoming: [], outgoing: [] });
        setOffersUnavailable(true);
        setErrorMessage('Live trade offers are unavailable. Reconnect before trading.');
      },
    );
    return () => {
      stopInventory();
      stopOffers();
    };
  }, [currentPlayerUid, fleetGroupId, sessionId]);

  const currentCounterparties = useMemo(
    () => counterparties.filter((player) => player.id !== currentPlayerUid),
    [counterparties, currentPlayerUid],
  );
  const incomingOffers = useMemo(
    () => participantName(offers.incoming, currentCounterparties, 'incoming'),
    [currentCounterparties, offers.incoming],
  );
  const outgoingOffers = useMemo(
    () => participantName(offers.outgoing, currentCounterparties, 'outgoing'),
    [currentCounterparties, offers.outgoing],
  );

  async function sendOffer(request: { recipientId: string; amounts: Readonly<Partial<Record<string, number>>> }): Promise<void> {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);
    setStatusMessage(null);
    const signature = JSON.stringify([
      request.recipientId,
      Object.entries(request.amounts).sort(([left], [right]) => left.localeCompare(right)),
    ]);
    try {
      const attempt = offerAttempt.current?.signature === signature
        ? offerAttempt.current
        : { signature, offerId: safeRequestId() };
      offerAttempt.current = attempt;
      const reply = await createSameTableTradeOffer(
        attempt.offerId,
        request.recipientId,
        request.amounts,
      );
      offerAttempt.current = null;
      const name = currentCounterparties.find((player) => player.id === request.recipientId)?.name ?? 'your table participant';
      setStatusMessage(reply.status === 'replayed'
        ? `That exact offer was already recorded for ${name}.`
        : `Offer sent to ${name}. Their acceptance is required before counts change.`);
    } catch {
      setErrorMessage('The offer could not be confirmed. Re-enter the same recipient and amounts to retry safely.');
    } finally {
      requestInFlight.current = false;
      setIsSubmitting(false);
    }
  }

  async function acceptOffer(offerId: string): Promise<void> {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setIsSubmitting(true);
    setPendingOfferId(offerId);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const reply = await acceptSameTableTradeOffer(offerId);
      if (reply.inventory) setInventory(reply.inventory);
      setStatusMessage(reply.status === 'replayed'
        ? 'This exact trade was already confirmed. Your current held-token counts are shown above.'
        : 'Trade confirmed. Your held-token counts are updated above.');
    } catch {
      setErrorMessage('That offer could not be accepted. It may have changed or the table connection may be stale.');
    } finally {
      requestInFlight.current = false;
      setPendingOfferId(null);
      setIsSubmitting(false);
    }
  }

  if (!inventoryLoaded) {
    return <section className="same-table-trade cic-frame" aria-label="Same-table trade">
      <p role="status">Checking your private held-token counts…</p>
    </section>;
  }

  if (errorMessage && inventory === null) {
    return <section className="same-table-trade cic-frame" aria-label="Same-table trade">
      <p role="alert">{errorMessage}</p>
    </section>;
  }

  if (!inventory) {
    return <section className="same-table-trade cic-frame" aria-label="Same-table trade">
      <h2>Same-table trade</h2>
      <p>Your personal held-token baseline is not recorded.</p>
      <p>Ask your facilitator to record the exact tokens already in your possession before making an offer.</p>
      {errorMessage && <p role="alert">{errorMessage}</p>}
    </section>;
  }

  return (
    <SameTableTradePanel
      currentPlayerName={currentPlayerName}
      balances={inventory.balances}
      counterparties={currentCounterparties}
      incomingOffers={incomingOffers}
      outgoingOffers={outgoingOffers}
      disabledReason={offersUnavailable ? 'Live trade offers are unavailable until your table connection is restored.' : null}
      isSubmitting={isSubmitting}
      pendingOfferId={pendingOfferId}
      statusMessage={statusMessage}
      errorMessage={errorMessage}
      onCreateOffer={(request) => { void sendOffer(request); }}
      onAcceptOffer={(offerId) => { void acceptOffer(offerId); }}
    />
  );
}
