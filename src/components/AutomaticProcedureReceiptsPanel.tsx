import { useEffect, useId, useState } from 'react';
import './AutomaticProcedureReceiptsPanel.css';
import { subscribeGmActionAuditDetails, type GmActionAuditDetail } from '@/lib/firestore';
import type { ActionAuditDetailValue } from '../../functions/src/actionAudit';

interface Props {
  readonly sessionId: string | undefined;
  readonly isGm: boolean;
}

function actionLabel(action: string): string {
  const words = action.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function valueText(value: ActionAuditDetailValue): string {
  if (value === null) return 'none';
  if (Array.isArray(value)) return value.map((entry) => valueText(entry)).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value).map(([key, entry]) => `${key}: ${valueText(entry)}`).join('; ');
  }
  return String(value);
}

function DetailList({ label, values }: {
  readonly label: string;
  readonly values: Readonly<Record<string, ActionAuditDetailValue>>;
}) {
  const id = useId();
  const entries = Object.entries(values);
  return (
    <div role="group" aria-labelledby={id}>
      <h5 className="gm-console__hint" id={id}>{label}</h5>
      {entries.length === 0
        ? <p className="gm-console__hint">None recorded.</p>
        : (
          <dl>
            {entries.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{valueText(value)}</dd>
              </div>
            ))}
          </dl>
        )}
    </div>
  );
}

function Receipt({ detail }: { readonly detail: GmActionAuditDetail }) {
  const id = useId();
  return (
    <li>
      <article className="automatic-receipts-panel__receipt" aria-labelledby={id}>
        <h4 className="gm-console__status" id={id}>
          {actionLabel(detail.action)} // {detail.requestId}
        </h4>
        <p className="gm-console__hint">
          {detail.resolutionSource.replace(/-/g, ' ')} // revision {detail.revision} // actor {detail.actorUid}
          {detail.createdAt ? ` // ${detail.createdAt}` : ''}
        </p>
        <DetailList label="Choice" values={detail.choice} />
        <DetailList label="Committed result" values={detail.result} />
      </article>
    </li>
  );
}

/**
 * Facilitator-only log of automatic procedures. It reads the server-written
 * choice and committed result; players never open this read path.
 */
export default function AutomaticProcedureReceiptsPanel({ sessionId, isGm }: Props) {
  const [details, setDetails] = useState<readonly GmActionAuditDetail[]>([]);

  useEffect(() => {
    if (!isGm || !sessionId || typeof subscribeGmActionAuditDetails !== 'function') return;
    let active = true;
    const stop = subscribeGmActionAuditDetails(sessionId, (next) => {
      if (active) setDetails(next);
    });
    return () => {
      active = false;
      stop();
    };
  }, [isGm, sessionId]);

  if (!isGm) return null;
  return (
    <section
      className="gm-console__module automatic-receipts-panel cic-frame"
      aria-label="Automatic procedure receipts"
    >
      <h3 className="gm-console__section-title">Automatic procedure receipts</h3>
      {details.length === 0
        ? <p className="gm-console__status" role="status">No automatic procedure receipts yet.</p>
        : (
          <ul className="automatic-receipts-panel__list">
            {details.map((detail) => <Receipt detail={detail} key={detail.requestId} />)}
          </ul>
        )}
    </section>
  );
}
