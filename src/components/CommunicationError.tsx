import { useEffect } from 'react';
import { useSessionStore } from '@/store/useSessionStore';

const NOTICE_MS = 6_000;

function reference(code: string): string {
  if (code === 'Wolf Intercepted Request Timeout') return 'WCI-TIMEOUT-15000';
  return `WCI-${code.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toUpperCase()}`;
}

export default function CommunicationError() {
  const error = useSessionStore((state) => state.communicationError);
  const clear = useSessionStore((state) => state.setCommunicationError);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => clear(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [clear, error]);

  if (!error) return null;
  const timeout = error.code === 'Wolf Intercepted Request Timeout';

  return (
    <aside className="communication-error cic-frame" role="alert">
      <strong>
        Error — {timeout ? error.code : `Wolf Communications Interception Code: ${error.code}`}
      </strong>
      <span>{error.message}</span>
      <span className="communication-error__reference">Reference: {reference(error.code)}</span>
      <button type="button" aria-label="Dismiss error" onClick={() => clear(null)}>×</button>
    </aside>
  );
}
