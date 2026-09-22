import { useLocation } from 'react-router-dom';
import {
  selectGmAccessAuthenticated,
  selectIsGm,
  useSessionStore,
} from '@/store/useSessionStore';
import { primaryStatusModel } from './primaryStatusModel';
import './primary-status.css';

const FIELDS = [
  ['cycle', 'Cycle'],
  ['phase', 'Phase'],
  ['location', 'Location'],
  ['authority', 'Authority'],
  ['nextAction', 'Next action'],
  ['failureState', 'Failure state'],
] as const;

export default function PrimaryStatus() {
  const { pathname } = useLocation();
  const session = useSessionStore((state) => state.session);
  const player = useSessionStore((state) => state.me);
  const facilitatorActive = useSessionStore(selectIsGm);
  const facilitatorAccessAuthenticated = useSessionStore(selectGmAccessAuthenticated);
  const facilitator = useSessionStore((state) => state.gmInstance);
  const roleBrief = useSessionStore((state) => state.roleBrief);
  const communicationError = useSessionStore((state) => state.communicationError);
  const connection = useSessionStore((state) => state.connection);
  const snapshotFreshness = useSessionStore((state) => state.sessionSnapshotFreshness);

  if (!session) return null;

  const status = primaryStatusModel({
    pathname,
    session,
    player,
    facilitatorActive,
    facilitatorAccessAuthenticated,
    facilitator,
    roleBrief,
    communicationError,
    connection,
    snapshotFreshness,
  });

  return (
    <section
      className="primary-status"
      aria-label="Primary game status"
      data-severity={status.severity}
    >
      <dl className="primary-status__grid">
        {FIELDS.map(([key, label]) => (
          <div className="primary-status__field" key={key}>
            <dt>{label}</dt>
            <dd>{status[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
