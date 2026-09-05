const ROLES = [
  {
    name: 'Player',
    description: 'Take a seat and join the crew.',
  },
  {
    name: 'Game Master',
    description: 'Guide the table and run the session.',
  },
  {
    name: 'Observer',
    description: 'Follow the action without taking a seat.',
  },
] as const;

export default function RoleSelect() {
  return (
    <main className="role-select">
      <div className="role-select__intro">
        <p className="eyebrow">Session ready</p>
        <h1 className="role-select__title">Choose your role</h1>
        <p className="role-select__lede">
          Select how you will take part at this table.
        </p>
      </div>

      <div className="role-select__grid">
        {ROLES.map((role) => (
          <button className="role-card" type="button" key={role.name}>
            <span className="role-card__name">{role.name}</span>
            <span className="role-card__description">{role.description}</span>
          </button>
        ))}
      </div>
    </main>
  );
}
