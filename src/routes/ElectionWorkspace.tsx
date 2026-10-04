import { Link, Navigate } from 'react-router-dom';
import PresidentialElectionWorkspace from '@/components/PresidentialElectionWorkspace';
import { useSessionStore } from '@/store/useSessionStore';
import './presidential-office.css';

export default function ElectionWorkspace() {
  const session = useSessionStore(state => state.session);
  const me = useSessionStore(state => state.me);
  if (!session || !me) return <Navigate to="/" replace />;
  return <main className="election-office">
    <header className="election-office__header cic-frame">
      <Link to="/console">Back to stations</Link>
      <p className="eyebrow">Fleet governance // server-owned procedure</p>
      <h1>Presidential election</h1>
      <p>Cast one private ballot during the published Team cycles. Candidate choices are secret; only the committed aggregate tally is published.</p>
    </header>
    <PresidentialElectionWorkspace />
  </main>;
}
