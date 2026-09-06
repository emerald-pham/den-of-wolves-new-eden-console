export default function RoleAssignment({ value }: { value: string }) {
  return (
    <dl className="ship-console__role">
      <div>
        <dt>Role assignment</dt>
        <dd>{value}</dd>
      </div>
    </dl>
  );
}
