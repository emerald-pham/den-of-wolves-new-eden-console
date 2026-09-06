export default function SessionReadouts({
  joinCode,
  connectedPlayers,
  label,
}: {
  joinCode: string;
  connectedPlayers: number | null;
  label: string;
}) {
  return (
    <div className="session-readouts" aria-label={label}>
      <div className="session-badge" aria-label={`Session code ${joinCode}`}>
        <span className="session-badge__label">Session code</span>
        <strong className="session-badge__code">{joinCode}</strong>
      </div>
      {connectedPlayers !== null && (
        <div className="personnel-count" aria-live="polite">
          {connectedPlayers} connected to CIC
        </div>
      )}
    </div>
  );
}
