import type { EndeavourFieldUpgradeOption } from '@/lib/endeavourFieldUpgradeService';
import './EndeavourFieldUpgradePanel.css';

interface Props {
  readonly options: readonly EndeavourFieldUpgradeOption[];
  readonly selectedKeys: readonly string[];
  readonly remaining: number;
  readonly showTargets: boolean;
  readonly selectionDisabled: boolean;
  readonly purchaseDisabled: boolean;
  readonly busy: boolean;
  readonly staleSelectionPending?: boolean;
  readonly uncertain?: boolean;
  readonly purchaseLabel: string;
  readonly refreshDisabled?: boolean;
  readonly onTargetChange: (option: EndeavourFieldUpgradeOption, checked: boolean) => void;
  readonly onPurchase: () => void;
  readonly onRetryStale: () => void;
  readonly onRetryExact: () => void;
  readonly onRefresh: () => void;
}

function targetKey(target: EndeavourFieldUpgradeOption): string {
  return `${target.shipId}:${target.systemId}`;
}

/** Service-free production controls shared by the live station and PC01 review scene. */
export default function EndeavourFieldUpgradeChoices({
  options,
  selectedKeys,
  remaining,
  showTargets,
  selectionDisabled,
  purchaseDisabled,
  busy,
  staleSelectionPending = false,
  uncertain = false,
  purchaseLabel,
  refreshDisabled = false,
  onTargetChange,
  onPurchase,
  onRetryStale,
  onRetryExact,
  onRefresh,
}: Props) {
  return <>
    {showTargets && options.length > 0 && <fieldset disabled={selectionDisabled}>
      <legend>Choose target consoles</legend>
      <ul aria-label="Available Endeavour field upgrades">
        {options.map((option) => {
          const key = targetKey(option);
          const checked = selectedKeys.includes(key);
          const full = !checked && selectedKeys.length >= remaining;
          const label = `${option.shipName} // ${option.systemName} // ${option.materialCost} materials`;
          return <li key={key}>
            <label>
              <input
                type="checkbox"
                checked={checked}
                disabled={full}
                onChange={(event) => onTargetChange(option, event.currentTarget.checked)}
              />
              <span>{label}</span>
            </label>
          </li>;
        })}
      </ul>
    </fieldset>}
    <div className="console-workspace__actions">
      {staleSelectionPending ? <button type="button" className="cic-action-button"
        disabled={purchaseDisabled} onClick={onRetryStale}>
        {busy ? 'Installing upgrades…' : 'Retry selected upgrades with current state'}
      </button> : <button type="button" className="cic-action-button" disabled={purchaseDisabled}
        onClick={onPurchase}>
        {busy ? 'Installing upgrades…' : purchaseLabel}
      </button>}
      {uncertain && <button type="button" className="cic-text-button" disabled={busy}
        onClick={onRetryExact}>
        {busy ? 'Confirming request…' : 'Retry exact request'}
      </button>}
      <button type="button" className="cic-text-button" disabled={busy || refreshDisabled}
        onClick={onRefresh}>
        Refresh private research and purchase state
      </button>
    </div>
  </>;
}
