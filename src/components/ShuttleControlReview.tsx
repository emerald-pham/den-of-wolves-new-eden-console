export type ShuttleControlPreviewStatus = 'pending' | 'stale' | 'committed' | 'unavailable';

export interface ShuttleControlPreviewOperation {
  readonly actionLabel: string;
  readonly status: ShuttleControlPreviewStatus;
  readonly message: string;
}

export interface ShuttleControlPreviewSnapshot {
  readonly holderLabel: string;
  readonly locationLabel: string;
  readonly movement: ShuttleControlPreviewOperation;
  readonly cargo?: ShuttleControlPreviewOperation | undefined;
  readonly service?: ShuttleControlPreviewOperation | undefined;
}

interface Props {
  readonly snapshot: ShuttleControlPreviewSnapshot;
}

const OPERATION_LABELS = {
  movement: 'Movement status',
  cargo: 'Cargo transfer status',
  service: 'Service status',
} as const;

/** Synthetic UI review only. This component has no session or command dependencies. */
export default function ShuttleControlReview({ snapshot }: Props) {
  const operations = [
    ['movement', snapshot.movement],
    ...(snapshot.cargo ? [['cargo', snapshot.cargo] as const] : []),
    ...(snapshot.service ? [['service', snapshot.service] as const] : []),
  ] as const;

  return (
    <section className="console-workspace__section shuttle-control" aria-label="Shuttle control preview">
      <p className="console-workspace__eyebrow">Review // presentation only</p>
      <h3>Shuttle control</h3>
      <p>Current holder // {snapshot.holderLabel}</p>
      <p>Shuttle location // {snapshot.locationLabel}</p>
      <p>Review view only. No shuttle action is sent.</p>
      <div className="aegis-system-grid">
        {operations.map(([key, operation]) => (
          <article className="aegis-system cic-frame" key={key} aria-label={OPERATION_LABELS[key]}>
            <p>{OPERATION_LABELS[key]}</p>
            <p>Status // {operation.status}</p>
            <p role="status">{operation.message}</p>
            <button className="cic-action-button shuttle-control__touch-target" type="button" disabled>
              {operation.actionLabel}
            </button>
            <p>This action is disabled in the review view.</p>
          </article>
        ))}
      </div>
    </section>
  );
}
