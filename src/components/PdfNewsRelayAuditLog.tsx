import { useEffect, useState } from 'react';
import type { PdfNewsRelayAudit, subscribeGmPdfNewsRelayAudits } from '@/lib/firestore';
import { PDF_ROLE_CONSOLE } from '@/data/pdfConsoles';
import { findConsoleRole } from '@/data/roles';

type Subscribe = typeof subscribeGmPdfNewsRelayAudits;

/** Lazily wire the facilitator-only subscription so the landing bundle stays free of Firestore. */
const defaultSubscribe: Subscribe = (sessionId, onAudits) => {
  let stop: (() => void) | undefined;
  let active = true;
  void import('@/lib/firestore').then(({ subscribeGmPdfNewsRelayAudits: subscribe }) => {
    if (active) stop = subscribe(sessionId, onAudits);
  });
  return () => {
    active = false;
    stop?.();
  };
};

function roleName(roleId: string): string {
  return roleId === PDF_ROLE_CONSOLE.roleId ? 'P.D.F. Colonel' : findConsoleRole(roleId)?.name ?? roleId;
}

/** Facilitator-only record of P.D.F. Colonel news relays (P2.2): group, text, and Press hand-off. */
export default function PdfNewsRelayAuditLog({ sessionId, subscribe = defaultSubscribe }: Readonly<{
  sessionId: string;
  subscribe?: Subscribe;
}>) {
  const [audits, setAudits] = useState<readonly PdfNewsRelayAudit[] | null | undefined>(undefined);
  useEffect(() => {
    setAudits(undefined);
    return subscribe(sessionId, setAudits);
  }, [sessionId, subscribe]);

  return (
    <section className="gm-console__module cic-frame" aria-label="P.D.F. news relay record">
      <h2 className="gm-console__section-title">P.D.F. news relays</h2>
      {audits === null && <p className="gm-console__status" role="status">
        The relay record is unavailable // reconnect the facilitator console.
      </p>}
      {(audits === undefined || audits?.length === 0) &&
        <p className="gm-console__hint">No P.D.F. Colonel relay has been sent.</p>}
      {audits && audits.length > 0 && <ul className="gm-event-log" aria-label="P.D.F. news relays">
        {audits.map((audit) => <li key={audit.requestId}>
          <time dateTime={audit.createdAt}>{new Date(audit.createdAt).toLocaleTimeString()}</time>
          <span>
            Cycle {audit.cycle} // {roleName(audit.actorRoleId)} // {audit.groupId} // {audit.text}
            {' // '}{audit.handedToPress ? 'Also handed to the Press' : 'Not handed to the Press'}
          </span>
        </li>)}
      </ul>}
    </section>
  );
}
