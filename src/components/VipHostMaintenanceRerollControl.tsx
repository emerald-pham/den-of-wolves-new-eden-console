import { useEffect, useState } from 'react';
import type { MaintenanceCycle } from '@/types/game';
import { useSessionStore } from '@/store/useSessionStore';
import { subscribeVipHostMaintenanceBenefit, rerollHostedShipMaintenance,
  type VipHostMaintenanceBenefitView } from '@/lib/vipHostService';
import { VipHostMaintenanceRerollPanel } from './Pc09SpecialistPresenters';

export default function VipHostMaintenanceRerollControl({
  shipId,
  shipLabel,
  cycle,
  maintenanceCycle,
  canUseGrant,
  consoleRoleId,
}: Readonly<{
  shipId: string;
  shipLabel: string;
  cycle: number;
  maintenanceCycle: MaintenanceCycle;
  canUseGrant: boolean;
  consoleRoleId?: string;
}>) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const connection = useSessionStore((state) => state.connection);
  const [benefit, setBenefit] = useState<VipHostMaintenanceBenefitView | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setBenefit(null);
    setChecked(false);
    setError(null);
    if (!session || !me || me.sessionId !== session.id || connection !== 'live' || shipId === 'dione' ||
        maintenanceCycle.turn !== cycle || !maintenanceCycle.unrestRolls) return () => { active = false; };
    const unsubscribe = subscribeVipHostMaintenanceBenefit(session.id, shipId, cycle, (next) => {
      if (!active) return;
      setBenefit(next);
      setChecked(true);
      setError(null);
    }, (cause) => {
      if (!active) return;
      setError(cause.message);
      setChecked(true);
    });
    return () => { active = false; unsubscribe(); };
  }, [connection, cycle, me, maintenanceCycle.turn, maintenanceCycle.unrestRolls, session, shipId]);

  if (!session || connection !== 'live' || (!benefit && !error)) return null;
  if (error) return <section className="pc09-specialist-panel cic-frame" aria-label="VIP Host maintenance reroll">
    <p role="alert">{error}</p>
  </section>;
  if (!checked || !benefit) return null;

  return <VipHostMaintenanceRerollPanel cycle={cycle} cycleStep={maintenanceCycle.step}
    shipLabel={shipLabel} unrestRolls={maintenanceCycle.unrestRolls}
    grantStatus={benefit.status} canUseGrant={canUseGrant}
    onReroll={async (dieIndex) => {
      await rerollHostedShipMaintenance({
        shipId, expectedCycle: cycle, expectedGrantRevision: benefit.revision,
        expectedMaintenanceRevision: maintenanceCycle.revision, dieIndex,
        ...(consoleRoleId ? { consoleRoleId } : {}),
      });
    }} />;
}
