import { useEffect, useMemo, useState } from 'react';
import { JOINT_ENGINEERING_ROLE_IDS, findConsoleRole } from '@/data/roles';
import { subscribeCivilUnrestGrievance, subscribeCivilUnrestPublic } from '@/lib/firestore';
import { submitCivilUnrestGrievance } from '@/lib/sessionService';
import { useSessionStore } from '@/store/useSessionStore';
import type { CivilUnrestGrievance, CivilUnrestPublicProjection } from '@/types/crisis';

const UNION_SHIPS: Readonly<Record<string, readonly string[]>> = {
  'joint-engineering-quellon-refinery': ['quellon', 'refinery-124'],
  'joint-engineering-shepherd-icebreaker': ['shepherd', 'icebreaker'],
};
const SHIP_NAMES: Readonly<Record<string, string>> = {
  dione: 'Dione', icebreaker: 'Icebreaker', shepherd: 'Shepherd',
  quellon: 'Quellon', 'refinery-124': 'Refinery 124',
};

function teamShips(
  activeRoleId: string | null | undefined,
  assignedRoleId: string | null | undefined,
  replacementRoleId: string | null | undefined,
  activeVesselIds: readonly string[] | undefined,
): readonly string[] {
  const candidates = (replacementRoleId ? [replacementRoleId] : [activeRoleId, assignedRoleId])
    .filter((role): role is string => typeof role === 'string');
  const ships = candidates.flatMap((roleId) => {
    if (JOINT_ENGINEERING_ROLE_IDS.includes(roleId as typeof JOINT_ENGINEERING_ROLE_IDS[number])) {
      return UNION_SHIPS[roleId] ?? [];
    }
    const shipId = findConsoleRole(roleId)?.shipId;
    return shipId && shipId in SHIP_NAMES ? [shipId] : [];
  });
  const active = activeVesselIds ? new Set(activeVesselIds) : null;
  return [...new Set(ships)].filter((shipId) => !active || active.has(shipId));
}

export default function CivilUnrestGrievancePanel({
  crisisId,
  crisisRevision,
}: { crisisId: string; crisisRevision: number }) {
  const sessionId = useSessionStore((state) => state.session?.id);
  const me = useSessionStore((state) => state.me);
  const activeVesselIds = useSessionStore((state) => state.session?.activeVesselIds);
  const identity = JSON.stringify([
    sessionId, me?.uid, me?.activeConsoleRoleId, me?.assignedRoleId, me?.replacementRoleId,
    activeVesselIds,
  ]);
  const ships = useMemo(() => teamShips(
    me?.activeConsoleRoleId, me?.assignedRoleId, me?.replacementRoleId, activeVesselIds,
  ), [me?.activeConsoleRoleId, me?.assignedRoleId, me?.replacementRoleId, activeVesselIds]);
  const teamShipKey = ships.join('|');
  const [publicProjection, setPublicProjection] = useState<CivilUnrestPublicProjection | null>(null);
  const [teamGrievances, setTeamGrievances] = useState<Readonly<Record<string, CivilUnrestGrievance | null>>>({});
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [shipId, setShipId] = useState(ships[0] ?? '');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId || !me?.uid) return;
    let current = true;
    const unsubscribers = [subscribeCivilUnrestPublic(sessionId, (projection) => {
      if (current) setPublicProjection(projection && projection.crisisId === crisisId ? projection : null);
    })];
    ships.forEach((teamShipId) => {
      unsubscribers.push(subscribeCivilUnrestGrievance(sessionId, teamShipId, (grievance) => {
        if (current) setTeamGrievances((previous) => ({ ...previous, [teamShipId]: grievance }));
      }));
    });
    setTeamGrievances({});
    return () => { current = false; unsubscribers.forEach((unsubscribe) => unsubscribe()); };
  }, [sessionId, me?.uid, identity, crisisId, ships, teamShipKey]);

  useEffect(() => {
    if (!ships.includes(shipId)) setShipId(ships[0] ?? '');
  }, [teamShipKey, ships, shipId]);

  if (!sessionId || !me || me.role !== 'player' || ships.length === 0) return null;
  const current = teamGrievances[shipId] ?? null;
  const isUnion = ships.length > 1;
  const submit = async () => {
    if (!shipId || !text.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const disposition = await submitCivilUnrestGrievance({
        crisisId, affectedShipId: shipId, visibility, text,
        expectedCrisisRevision: crisisRevision,
        expectedGrievanceRevision: current?.revision ?? 0,
      });
      setText('');
      setMessage(disposition === 'queued' ? 'Saved to send when the connection returns.' : 'Grievance submitted.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The grievance could not be submitted. Refresh and try again.');
    } finally { setBusy(false); }
  };

  return (
    <section className="civil-unrest-grievance cic-frame" aria-label="Civil Unrest team grievances">
      <h3>Team grievances</h3>
      <p className="crisis-report__status">Submit your team&apos;s own account during Team Phase.</p>
      {publicProjection && publicProjection.grievances.length > 0 && (
        <div aria-label="Public grievances">
          <h4>Public grievances</h4>
          {publicProjection.grievances.map((grievance) => (
            <article key={grievance.shipId} className="civil-unrest-grievance__entry">
              <strong>{SHIP_NAMES[grievance.shipId] ?? grievance.shipId}</strong>
              <span className="civil-unrest-grievance__audience">Public — all session members</span>
              <p>{grievance.text}</p>
            </article>
          ))}
        </div>
      )}
      {isUnion && (
        <label>
          Affected team
          <select value={shipId} onChange={(event) => setShipId(event.target.value)}>
            {ships.map((teamShipId) => <option key={teamShipId} value={teamShipId}>{SHIP_NAMES[teamShipId]}</option>)}
          </select>
        </label>
      )}
      {current && (
        <article className="civil-unrest-grievance__entry" aria-label="Your current team grievance">
          <strong>Your current grievance</strong>
          <span className="civil-unrest-grievance__audience">
            {current.visibility === 'public' ? 'Public — all session members' : 'Private — your current team and facilitators'}
          </span>
          <p>{current.text}</p>
        </article>
      )}
      <label htmlFor="civil-unrest-grievance-text">Your team&apos;s grievance</label>
      <textarea id="civil-unrest-grievance-text" value={text} maxLength={2000}
        onChange={(event) => setText(event.target.value)} placeholder="Describe your team's grievance..." />
      <fieldset>
        <legend>Audience</legend>
        <label><input type="radio" name="civil-unrest-audience" value="private"
          checked={visibility === 'private'} onChange={() => setVisibility('private')} />
          Private — your current team and facilitators</label>
        <label><input type="radio" name="civil-unrest-audience" value="public"
          checked={visibility === 'public'} onChange={() => setVisibility('public')} />
          Public — all session members</label>
      </fieldset>
      <button type="button" className="cic-action-button" disabled={busy || !text.trim()} onClick={submit}>
        {current ? 'Revise grievance' : 'Submit grievance'}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
