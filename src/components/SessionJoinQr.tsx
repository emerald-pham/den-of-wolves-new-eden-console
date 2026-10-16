import { buildSessionJoinUrl, qrCodeMatrix } from '@/lib/sessionJoinLink';

export default function SessionJoinQr({ joinCode }: Readonly<{ joinCode: string }>) {
  let joinUrl: string | null = null;
  let matrix: readonly (readonly boolean[])[] | null = null;
  try {
    joinUrl = buildSessionJoinUrl(joinCode, window.location.href);
    matrix = qrCodeMatrix(joinUrl);
  } catch {
    // Keep the code and ordinary link available if a custom host URL cannot fit.
  }
  if (joinUrl === null) {
    return (
      <section className="session-join-qr cic-frame" aria-labelledby="session-join-qr-title">
        <h3 id="session-join-qr-title">Join this session</h3>
        <p role="status">The join link is unavailable. Share the session code shown above.</p>
      </section>
    );
  }
  const quietZone = 4;
  const size = matrix?.length ?? 0;
  const path = matrix?.flatMap((row, y) => row.flatMap((dark, x) =>
    dark ? [`M${x + quietZone},${y + quietZone}h1v1h-1z`] : [])).join('') ?? '';

  return (
    <section className="session-join-qr cic-frame" aria-labelledby="session-join-qr-title">
      <h3 id="session-join-qr-title">Join this session</h3>
      {matrix && <svg
        className="session-join-qr__image"
        role="img"
        aria-label={`QR code for session ${joinCode}`}
        viewBox={`0 0 ${size + quietZone * 2} ${size + quietZone * 2}`}
        shapeRendering="crispEdges"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="100%" height="100%" fill="var(--cic-ink)" />
        <path d={path} fill="var(--cic-void)" />
      </svg>}
      {matrix === null && <p role="status">The join link is too long for a QR code on this host.</p>}
      <p>Scan to open the ordinary join screen.</p>
      <a className="session-join-qr__link" href={joinUrl}>
        Open join screen for session {joinCode}
      </a>
    </section>
  );
}
