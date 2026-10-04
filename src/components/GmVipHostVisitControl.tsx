import { useEffect, useState } from 'react';
import { SHIPS } from '@/data/ships';
import { useSessionStore, selectIsGm } from '@/store/useSessionStore';
import { attestVipHostVisit, subscribeGmVipHostVisit, type VipHostVisitView } from '@/lib/vipHostService';
import { VipHostPanel } from './Pc09SpecialistPresenters';

export default function GmVipHostVisitControl() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const gmInstance = useSessionStore((state) => state.gmInstance);
  const connection = useSessionStore((state) => state.connection);
  const isGm = useSessionStore(selectIsGm);
  const [visit, setVisit] = useState<VipHostVisitView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const cycle = session?.currentTurn ?? 0;
  const ready = Boolean(isGm && session && cycle > 0 && me?.uid && me.sessionId === session.id &&
    connection === 'live' && gmInstance?.sessionId === session.id && gmInstance.uid === me.uid);

  useEffect(() => {
    setVisit(null);
    setLoaded(false);
    setError(null);
    if (!ready || !session || cycle < 1) return;
    return subscribeGmVipHostVisit(session.id, cycle, (next) => {
      setVisit(next);
      setLoaded(true);
      setError(null);
    }, (cause) => {
      setLoaded(true);
      setError(cause.message);
    });
  }, [cycle, ready, refreshKey, session]);

  if (!isGm || !session || cycle < 1) return null;
  const destinations = (session.activeVesselIds ?? []).flatMap((shipId) => {
    if (shipId === 'dione') return [];
    const ship = SHIPS.find((entry) => entry.id === shipId);
    return ship ? [{ id: ship.id, label: ship.name }] : [];
  });
  const destinationLabel = visit
    ? destinations.find((destination) => destination.id === visit.shipId)?.label ?? visit.shipId : undefined;

  if (!ready || !loaded) return <section className="pc09-specialist-panel cic-frame" aria-label="VIP Host physical visit">
    <p role={error ? 'alert' : 'status'}>{error ?? 'Checking the current GM attestation authority…'}</p>
  </section>;
  if (error) return <section className="pc09-specialist-panel cic-frame" aria-label="VIP Host physical visit">
    <p role="alert">{error}</p>
  </section>;

  return <VipHostPanel cycle={cycle} visitStatus={visit ? 'attested' : 'unattested'} currentShipId="dione"
    destinations={destinations} grant={null} canAttestVisit={ready} canUseGrant={false}
    {...(destinationLabel ? { attestedDestinationLabel: destinationLabel } : {})}
    onAttestVisit={async (shipId) => {
      setError(null);
      try {
        await attestVipHostVisit(shipId);
        setRefreshKey((key) => key + 1);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The visit attestation could not be recorded.');
        throw cause;
      }
    }}
    onReroll={async () => {}}
  />;
}
