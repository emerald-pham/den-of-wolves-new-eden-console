import { Navigate, Link } from 'react-router-dom';
import PresidentWorkspace from '@/components/PresidentWorkspace';
import { useSessionStore } from '@/store/useSessionStore';
import './presidential-office.css';

/** Elected President route is independent from the assigned ship station and seat. */
export default function PresidentOffice() {
  const session = useSessionStore(state => state.session);
  const me = useSessionStore(state => state.me);
  if (!session || !me) return <Navigate to="/" replace />;
  if (me.role !== 'player' || session.currentMemberIsPresident !== true) {
    return <main className="president-office">
      <article className="cic-frame">
        <Link to="/console">Back to stations</Link>
        <h1>President&apos;s office</h1>
        <p role="status">The current session has not elected you President.</p>
      </article>
    </main>;
  }
  return <main className="president-office">
    <header className="president-office__header cic-frame">
      <Link to="/console">Back to stations</Link>
      <p className="eyebrow">Session-scoped office // ship roles and seats remain unchanged</p>
      <h1>President&apos;s office</h1>
      <p>Use the current bounded President powers. Fleet policy records do not grant ship resources or private information.</p>
    </header>
    <PresidentWorkspace writable />
  </main>;
}
