import { useState } from 'react';
import type { WolfAttackTargetId } from '@/types/game';

export interface WolfBoardingSupportChoiceView {
  readonly type: 'wolf-boarding-support-choice-view';
  readonly status: 'pending' | 'committed' | 'unavailable';
  readonly craftId: 'pallas' | 'chepu';
  readonly currentHostId: WolfAttackTargetId;
  readonly fuelled: boolean;
  readonly legalHostIds: readonly WolfAttackTargetId[];
  readonly selectedHostId?: WolfAttackTargetId | null;
}

export function WolfBoardingSupportChoicePanelView({
  view, onChoose, busy = false,
}: Readonly<{
  view: WolfBoardingSupportChoiceView;
  onChoose(hostShipId: WolfAttackTargetId | null): void;
  busy?: boolean;
}>) {
  const craftName = view.craftId === 'pallas' ? 'Pallas' : 'Chepu';
  if (view.status !== 'pending') {
    return <section aria-label={`${craftName} boarding relocation`}>
      <h3>{craftName} boarding relocation</h3>
      <p>{view.status === 'committed'
        ? view.selectedHostId ? `${craftName} is now docked at ${shipName(view.selectedHostId)}.`
          : `${craftName} stayed docked at ${shipName(view.currentHostId)}.`
        : `${craftName} relocation is unavailable.`}</p>
    </section>;
  }
  return <section aria-label={`${craftName} boarding relocation`}>
    <h3>{craftName} boarding relocation</h3>
    <p>Current host: {shipName(view.currentHostId)}. Fuel {view.fuelled ? 'is available' : 'is unavailable'}.</p>
    <div className="boarding-choice-actions">
      <button type="button" disabled={busy} onClick={() => onChoose(null)}>
        Stay at {shipName(view.currentHostId)}
      </button>
      {view.fuelled && view.legalHostIds.filter((target) => target !== view.currentHostId).map((target) => (
        <button key={target} type="button" disabled={busy} onClick={() => onChoose(target)}>
          Move {craftName} to {shipName(target)}
        </button>
      ))}
    </div>
  </section>;
}

export interface WolfBoardingCommanderChoiceView {
  readonly type: 'wolf-boarding-commander-choice-view';
  readonly status: 'pending' | 'committed' | 'unavailable';
  readonly targets: readonly Readonly<{ targetShipId: WolfAttackTargetId; boardingParties: number }>[];
  readonly selectedTargetId?: WolfAttackTargetId | null;
}

export function WolfBoardingCommanderChoicePanelView({
  view, onChoose, busy = false,
}: Readonly<{
  view: WolfBoardingCommanderChoiceView;
  onChoose(targetShipId: WolfAttackTargetId | null): void;
  busy?: boolean;
}>) {
  return <section aria-label="Wolf Commander boarding leadership">
    <h3>Wolf Commander boarding leadership</h3>
    {view.status === 'pending' ? <>
      <p>Add two boarding parties to one target before relocation and crew defence, or pass.</p>
      <div className="boarding-choice-actions">
        {view.targets.map(({ targetShipId, boardingParties }) => <button key={targetShipId} type="button" disabled={busy}
          onClick={() => onChoose(targetShipId)}>
          Lead at {shipName(targetShipId)} ({boardingParties} current parties)
        </button>)}
        <button type="button" disabled={busy} onClick={() => onChoose(null)}>Do not lead</button>
      </div>
    </> : <p>{view.status === 'committed'
      ? view.selectedTargetId ? `Two parties are added at ${shipName(view.selectedTargetId)}.` : 'The Commander passed.'
      : 'No current Wolf Commander can make this choice.'}</p>}
  </section>;
}

export interface WolfBoardingMilitiaChoiceView {
  readonly type: 'wolf-boarding-militia-choice-view';
  readonly status: 'pending' | 'committed' | 'unavailable';
  readonly targetShipId: WolfAttackTargetId;
  readonly boardingParties: number;
  readonly availableSecurityTeams: number;
  readonly maxFrontLineDice: number;
  readonly doubleDiceAvailable: boolean;
  readonly selectedSecurityTeams?: number;
  readonly militiaDoubleTeams?: boolean;
  readonly militiaFrontLineDice?: number;
  readonly militiaLeaderKilled?: boolean;
}

export function WolfBoardingMilitiaChoicePanelView({
  view, onChoose, busy = false,
}: Readonly<{
  view: WolfBoardingMilitiaChoiceView;
  onChoose(choice: Readonly<{
    securityTeams: number;
    militiaDoubleTeams: boolean;
    militiaFrontLineDice: number;
  }>): void;
  busy?: boolean;
}>) {
  const [securityTeams, setSecurityTeams] = useState(view.selectedSecurityTeams ?? view.availableSecurityTeams);
  const [doubleTeams, setDoubleTeams] = useState(view.militiaDoubleTeams ?? false);
  const [frontLineDice, setFrontLineDice] = useState(view.militiaFrontLineDice ?? 0);
  if (view.status !== 'pending') {
    return <section aria-label={`${shipName(view.targetShipId)} Militia defence`}>
      <h3>{shipName(view.targetShipId)} Militia defence</h3>
      <p>{view.status === 'committed'
        ? `${view.selectedSecurityTeams ?? 0} Security Teams committed${view.militiaLeaderKilled ? '; the Militia Leader was killed.' : '.'}`
        : 'No current Militia Leader can make this choice.'}</p>
    </section>;
  }
  return <section aria-label={`${shipName(view.targetShipId)} Militia defence`}>
    <h3>{shipName(view.targetShipId)} Militia defence</h3>
    <p>{view.boardingParties} boarding parties face {view.availableSecurityTeams} Security Teams.</p>
    <label>
      Security Teams to commit
      <select aria-label="Security Teams to commit" value={securityTeams} disabled={busy}
        onChange={(event) => setSecurityTeams(Number(event.target.value))}>
        {Array.from({ length: view.availableSecurityTeams + 1 }, (_, count) => (
          <option key={count} value={count}>{count}</option>
        ))}
      </select>
    </label>
    {view.doubleDiceAvailable && <label>
      <input type="checkbox" checked={doubleTeams} disabled={busy} onChange={(event) => setDoubleTeams(event.target.checked)} />
      Roll two dice per Security Team
    </label>}
    <label>
      Front-line dice
      <select aria-label="Front-line dice" value={frontLineDice} disabled={busy}
        onChange={(event) => setFrontLineDice(Number(event.target.value))}>
        {Array.from({ length: view.maxFrontLineDice + 1 }, (_, count) => (
          <option key={count} value={count}>{count}</option>
        ))}
      </select>
    </label>
    {view.maxFrontLineDice > 0 && <p>A front-line 1 costs a Security Team and kills the Militia Leader.</p>}
    <button type="button" disabled={busy} onClick={() => onChoose({
      securityTeams, militiaDoubleTeams: doubleTeams, militiaFrontLineDice: frontLineDice,
    })}>Commit defence</button>
  </section>;
}

export interface WolfBoardingRerollChoiceView {
  readonly type: 'wolf-boarding-reroll-choice-view';
  readonly source: 'aegis' | 'pallas';
  readonly status: 'pending' | 'committed' | 'unavailable';
  readonly dice: readonly Readonly<{ targetShipId: WolfAttackTargetId; dieIndex: number; value: number }>[];
  readonly alreadyRerolled: readonly Readonly<{ targetShipId: WolfAttackTargetId; dieIndex: number }>[];
  readonly maxRerolls: number;
  readonly selectedDice?: readonly Readonly<{ targetShipId: WolfAttackTargetId; dieIndex: number }>[];
}

export function WolfBoardingRerollChoicePanelView({
  view, onChoose, busy = false,
}: Readonly<{
  view: WolfBoardingRerollChoiceView;
  onChoose(dice: readonly Readonly<{ targetShipId: WolfAttackTargetId; dieIndex: number }>[]): void;
  busy?: boolean;
}>) {
  const [selected, setSelected] = useState<Readonly<{ targetShipId: WolfAttackTargetId; dieIndex: number }>[]>(
    [...(view.selectedDice ?? [])],
  );
  const title = view.source === 'aegis' ? 'AEGIS Battle Sheet' : 'Pallas';
  const rerolled = new Set(view.alreadyRerolled.map(({ targetShipId, dieIndex }) => `${targetShipId}:${dieIndex}`));
  const selectedKey = (die: Readonly<{ targetShipId: WolfAttackTargetId; dieIndex: number }>) => `${die.targetShipId}:${die.dieIndex}`;
  const toggle = (die: Readonly<{ targetShipId: WolfAttackTargetId; dieIndex: number }>) => {
    const key = selectedKey(die);
    if (selected.some((entry) => selectedKey(entry) === key)) {
      setSelected(selected.filter((entry) => selectedKey(entry) !== key));
    } else if (selected.length < view.maxRerolls && !rerolled.has(key)) {
      setSelected([...selected, die]);
    }
  };
  return <section aria-label={`${title} boarding rerolls`}>
    <h3>{title} boarding rerolls</h3>
    {view.status === 'pending' ? <>
      <p>Choose up to {view.maxRerolls} dice. Each die can be rerolled only once.</p>
      <div>{view.dice.map((die) => {
        const key = selectedKey(die);
        return <label key={key}>
          <input type="checkbox" aria-label={`${shipName(die.targetShipId)} die ${die.dieIndex + 1}: ${die.value}`}
            checked={selected.some((entry) => selectedKey(entry) === key)}
            disabled={busy || rerolled.has(key) || (!selected.some((entry) => selectedKey(entry) === key) && selected.length >= view.maxRerolls)}
            onChange={() => toggle(die)} />
          {shipName(die.targetShipId)} die {die.dieIndex + 1}: {die.value}{rerolled.has(key) ? ' (already rerolled)' : ''}
        </label>;
      })}</div>
      <div className="boarding-choice-actions">
        <button type="button" disabled={busy || selected.length === 0} onClick={() => onChoose(selected.map(({ targetShipId, dieIndex }) => ({ targetShipId, dieIndex })))}>
          Reroll selected dice
        </button>
        <button type="button" disabled={busy} onClick={() => onChoose([])}>Pass rerolls</button>
      </div>
    </> : <p>{view.status === 'committed' ? 'This source’s reroll choice is recorded.' : 'This reroll source is unavailable.'}</p>}
  </section>;
}

export interface WolfBoardingCommanderRulingView {
  readonly type: 'wolf-boarding-commander-ruling-view';
  readonly status: 'pending' | 'committed';
  readonly targetShipId: WolfAttackTargetId;
  readonly condition: string;
  readonly rulingText?: string;
}

export function WolfBoardingCommanderRulingPanelView({
  view, onChoose, busy = false,
}: Readonly<{
  view: WolfBoardingCommanderRulingView;
  onChoose(rulingText: string): void;
  busy?: boolean;
}>) {
  const [ruling, setRuling] = useState(view.rulingText ?? '');
  return <section aria-label="Facilitator ruling for destroyed Commander-led parties">
    <h3>Facilitator ruling required</h3>
    <p>{view.condition}</p>
    {view.status === 'committed' ? <p>Recorded ruling: {view.rulingText}</p> : <>
      <label>
        Facilitator ruling
        <textarea aria-label="Facilitator ruling" value={ruling} disabled={busy}
          onChange={(event) => setRuling(event.target.value)} />
      </label>
      <button type="button" disabled={busy || !ruling.trim()} onClick={() => onChoose(ruling.trim())}>
        Record facilitator ruling
      </button>
    </>}
  </section>;
}

function shipName(target: WolfAttackTargetId): string {
  if (target === 'refinery-124') return 'Refinery 124';
  return target.charAt(0).toUpperCase() + target.slice(1);
}
