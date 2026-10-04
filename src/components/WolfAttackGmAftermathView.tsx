import type { GameSession, WolfAttackDeclarationState } from '@/types/game';
import './WolfAttackGmAftermathView.css';

type UnknownRecord = Record<string, unknown>;

export interface WolfAttackGmAftermathDamageRow {
  readonly shipId: string;
  readonly amount: number;
  readonly populationBefore: number;
  readonly populationAfter: number;
  readonly destroyed: boolean;
  readonly damagedSystemIds: readonly string[];
  readonly draws: readonly Readonly<{
    card?: string;
    systemName?: string;
    recycled: boolean;
    casualty: boolean;
    destroyed: boolean;
  }>[];
}

export interface WolfAttackGmAftermathViewModel {
  readonly attackId: string;
  readonly turn: number;
  readonly damage: readonly WolfAttackGmAftermathDamageRow[];
  readonly doctor?: Pick<NonNullable<NonNullable<WolfAttackDeclarationState['aftermath']>['doctor']>,
    'selectedShipIds' | 'mitigated'>;
  readonly warriorSalvage?: Pick<NonNullable<NonNullable<WolfAttackDeclarationState['aftermath']>['warriorSalvage']>,
    'hostShipId' | 'damageDice' | 'materialsGained'>;
  readonly scrapClaims: Readonly<Record<string, Readonly<{ shuttleId: 'macaw' | 'boa'; scrap: 1 }>>>;
  readonly returningInstanceIds: readonly string[];
  readonly survivingWolfShips: readonly Readonly<{ instanceId: string; shipId: string; target: string }>[];
  readonly pendingWork: Readonly<{
    doctorShipIds: readonly string[];
    salvageAvailable: boolean;
    scrapShipIds: readonly string[];
    damagedSystems: readonly Readonly<{ shipId: string; systemIds: readonly string[] }>[];
    survivingThreatInstanceIds: readonly string[];
  }>;
}

function record(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]+$/.test(value);
}

/** Pure adapter from the authenticated GM subscription to a presentation-only view model. */
export function projectWolfAttackGmAftermathView(
  state: WolfAttackDeclarationState,
  currentShipDamage?: GameSession['shipDamage'],
): WolfAttackGmAftermathViewModel | null {
  const receipt = record(state.calculationReceipt) ? state.calculationReceipt : null;
  if (state.status !== 'resolved' || !state.attackId || !receipt || !Array.isArray(receipt.fleetDamage)) return null;
  const damage = receipt.fleetDamage.flatMap((raw): WolfAttackGmAftermathDamageRow[] => {
    if (!record(raw) || !safeId(raw.target) || !Number.isSafeInteger(raw.amount) ||
        !Number.isSafeInteger(raw.populationBefore) || !Number.isSafeInteger(raw.population) || !record(raw.state) ||
        typeof raw.state.destroyed !== 'boolean' || !Array.isArray(raw.state.damagedSystemIds) ||
        raw.state.damagedSystemIds.some((id) => !safeId(id)) || !Array.isArray(raw.draws)) return [];
    const draws = raw.draws.flatMap((entry) => {
      if (!record(entry) || typeof entry.destroyed !== 'boolean' || typeof entry.casualty !== 'boolean') return [];
      if (entry.destroyed) return [{ recycled: false, casualty: entry.casualty, destroyed: true }];
      if (!record(entry.card) || typeof entry.card.card !== 'string' || typeof entry.card.systemName !== 'string' ||
          typeof entry.recycled !== 'boolean') return [];
      return [{ card: entry.card.card, systemName: entry.card.systemName,
        recycled: entry.recycled, casualty: entry.casualty, destroyed: false }];
    });
    return [{ shipId: raw.target, amount: raw.amount as number,
      populationBefore: raw.populationBefore as number, populationAfter: raw.population as number,
      destroyed: raw.state.destroyed, damagedSystemIds: [...raw.state.damagedSystemIds] as string[], draws }];
  });
  const aftermath = state.aftermath;
  const casualtyShipIds = damage.filter((row) => row.draws.some(({ casualty }) => casualty)).map(({ shipId }) => shipId);
  const rangeDamageExists = Array.isArray(receipt.ranges) && receipt.ranges.some((range) => record(range) &&
    record(range.damageByInstance) && Object.values(range.damageByInstance).some((amount) =>
      Number.isSafeInteger(amount) && (amount as number) > 0));
  const fighterAceDamageExists = state.memberResults?.some((row) => record(row) && row.sourceId === 'pdf-fighter-ace' &&
    record(row.outcome) && Number.isSafeInteger(row.outcome.damage) && (row.outcome.damage as number) > 0) === true;
  const scrapClaims = aftermath?.scrapClaims;
  const scrapShipIds = damage.filter((row) => row.amount >= 3 && !row.destroyed && !scrapClaims?.[row.shipId])
    .map(({ shipId }) => shipId);
  const currentDamage = currentShipDamage
    ? Object.entries(currentShipDamage).flatMap(([shipId, ship]) => {
      if (!safeId(shipId) || !ship || typeof ship.destroyed !== 'boolean' || !Array.isArray(ship.damagedSystemIds) ||
          ship.damagedSystemIds.some((id) => !safeId(id)) || ship.destroyed || ship.damagedSystemIds.length === 0) return [];
      return [{ shipId, systemIds: [...ship.damagedSystemIds] }];
    })
    : damage.flatMap((row) => row.damagedSystemIds.length > 0
      ? [{ shipId: row.shipId, systemIds: row.damagedSystemIds }] : []);
  const survivingWolfShips = Array.isArray(receipt.survivingWolfShips)
    ? receipt.survivingWolfShips.flatMap((ship) => record(ship) && typeof ship.instanceId === 'string' &&
      typeof ship.shipId === 'string' && typeof ship.target === 'string'
      ? [{ instanceId: ship.instanceId, shipId: ship.shipId, target: ship.target }] : []) : [];
  const returningInstanceIds = Array.isArray(receipt.returningInstanceIds)
    ? receipt.returningInstanceIds.filter((id): id is string => typeof id === 'string') : [];
  return {
    attackId: state.attackId, turn: state.turn, damage,
    ...(aftermath?.doctor ? { doctor: aftermath.doctor } : {}),
    ...(aftermath?.warriorSalvage ? { warriorSalvage: aftermath.warriorSalvage } : {}),
    scrapClaims: scrapClaims ?? {}, returningInstanceIds, survivingWolfShips,
    pendingWork: {
      doctorShipIds: aftermath?.doctor ? [] : casualtyShipIds,
      salvageAvailable: !aftermath?.warriorSalvage && (rangeDamageExists || fighterAceDamageExists || damage.some(({ amount }) => amount > 0)),
      scrapShipIds,
      damagedSystems: currentDamage,
      survivingThreatInstanceIds: survivingWolfShips.map(({ instanceId }) => instanceId),
    },
  };
}

export function WolfAttackGmAftermathView({ view }: Readonly<{ view: WolfAttackGmAftermathViewModel }>) {
  const claims = view.scrapClaims ?? {};
  const recoveryRows: string[] = [];
  view.pendingWork.doctorShipIds.forEach((shipId) => recoveryRows.push(`Doctor Medical Aid // ${shipId}`));
  if (view.pendingWork.salvageAvailable) recoveryRows.push('Warrior Salvage Drones // resolve charged salvage');
  view.pendingWork.scrapShipIds.forEach((shipId) => recoveryRows.push(`Collect Scrap // ${shipId}`));
  view.pendingWork.damagedSystems.forEach(({ shipId, systemIds }) =>
    systemIds.forEach((systemId) => recoveryRows.push(`Repair ${systemId} on ${shipId.toUpperCase()}`)));
  view.pendingWork.survivingThreatInstanceIds.forEach((instanceId) => recoveryRows.push(`Surviving threat // ${instanceId}`));

  return (
    <section className="wolf-attack-gm-aftermath cic-frame" aria-label="Private Wolf aftermath receipt">
      <header>
        <p className="eyebrow">Private facilitator record // cycle {view.turn}</p>
        <h3>Wolf attack aftermath</h3>
        <small>{view.attackId}</small>
      </header>
      <section aria-label="Committed ship damage">
        <h4>Committed damage and damage cards</h4>
        {view.damage.length ? <ul className="wolf-attack-gm-aftermath__damage">
          {view.damage.map((row) => (
            <li key={row.shipId}>
              <strong>{row.shipId.toUpperCase()} // {row.amount} damage{row.destroyed ? ' // destroyed' : ''}</strong>
              <p>Population {row.populationBefore.toLocaleString()} → {row.populationAfter.toLocaleString()}</p>
              {row.draws.map((draw, index) => <p key={`${row.shipId}-draw-${index}`}>
                {draw.destroyed ? 'Required damage draw exhausted // catastrophe applied' :
                  `${draw.card} // ${draw.systemName}${draw.recycled ? ' // recycled' : ''}`}
                {draw.casualty ? ' // casualty' : ' // no casualty'}
              </p>)}
            </li>
          ))}
        </ul> : <p>No fleet damage was committed.</p>}
      </section>
      <section aria-label="Committed aftermath actions">
        <h4>Committed aftermath actions</h4>
        <ul>
          {view.doctor?.mitigated.map((entry) => <li key={`doctor-${entry.shipId}`}>
            Doctor Medical Aid // {entry.shipId.toUpperCase()} // {entry.casualtiesPrevented} casualty prevented //
            {' '}{entry.foodSpent} food, {entry.waterSpent} water
          </li>)}
          {view.warriorSalvage && <li>
            Warrior Salvage Drones // {view.warriorSalvage.hostShipId.toUpperCase()} // {view.warriorSalvage.materialsGained} materials //
            {' '}server dice {view.warriorSalvage.damageDice.join(', ') || 'none'}
          </li>}
          {Object.entries(claims).map(([shipId, claim]) => <li key={`scrap-${shipId}`}>
            {claim.shuttleId === 'macaw' ? 'Macaw' : 'Boa'} // 1 Scrap // {shipId.toUpperCase()}
          </li>)}
          {!view.doctor && !view.warriorSalvage && Object.keys(claims).length === 0 && <li>No recovery action has been committed yet.</li>}
        </ul>
      </section>
      <section aria-label="Outstanding recovery work">
        <h4>Outstanding recovery work and remaining threats</h4>
        {recoveryRows.length ? <ul aria-label="Outstanding recovery work">{recoveryRows.map((item) => <li key={item}>{item}</li>)}</ul> :
          <p>No outstanding aftermath work is recorded.</p>}
        {view.returningInstanceIds.length > 0 && <p>Returning Wolves // {view.returningInstanceIds.join(', ')}</p>}
        {view.survivingWolfShips.length > 0 && <p>Surviving Wolf ships // {view.survivingWolfShips
          .map(({ instanceId, shipId, target }) => `${instanceId} ${shipId} targeting ${target}`).join(' // ')}</p>}
      </section>
    </section>
  );
}
