import { Navigate } from 'react-router-dom';
import { useSessionStore } from '@/store/useSessionStore';
import type { PlayerRole } from '@/types/game';

const ROLE_DETAILS: Record<
  PlayerRole,
  { readonly label: string; readonly description: string }
> = {
  player: {
    label: 'Player',
    description: 'Take a seat and join the crew.',
  },
  gm: {
    label: 'Game Master',
    description: 'Guide the table and run the session.',
  },
  observer: {
    label: 'Observer',
    description: 'Follow the action without taking a seat.',
  },
};

export default function RoleSelect() {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);

  if (!session || !me) return <Navigate to="/" replace />;

  const role = ROLE_DETAILS[me.role];

  return (
    <main className="role-select">
      <div className="role-select__intro">
        <p className="eyebrow">{session.name}</p>
        <h1 className="role-select__title">Session ready</h1>
        <p className="role-select__lede">You are connected as:</p>
      </div>

      <div className="role-card role-card--static">
        <span className="role-card__name">{role.label}</span>
        <span className="role-card__description">{role.description}</span>
      </div>
    </main>
  );
}
