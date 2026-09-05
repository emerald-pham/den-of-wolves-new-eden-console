import ConnectionIndicator from './ConnectionIndicator';
import { selectConnectionStatus, useSessionStore } from '@/store/useSessionStore';

export default function AppHeader() {
  const status = useSessionStore(selectConnectionStatus);
  const joinCode = useSessionStore((state) => state.session?.joinCode);

  return (
    <header className="app-header">
      {joinCode !== undefined && (
        <div className="session-badge" aria-label={`Session code ${joinCode}`}>
          <span className="session-badge__label">Session code</span>
          <strong className="session-badge__code">{joinCode}</strong>
        </div>
      )}
      <ConnectionIndicator status={status} />
    </header>
  );
}
