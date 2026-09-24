import { SHIPS, SMALL_SHIPS } from '@/data/ships';
import { extraShipCaptainWorkspaceFor } from '@/data/extraShipCaptainWorkspaces';
import { useSessionStore } from '@/store/useSessionStore';
import type { RoleId } from '@/types/identifiers';
import GorgoneionRepairDronesPanel from './GorgoneionRepairDronesPanel';
import WarriorRepairDronesPanel from './WarriorRepairDronesPanel';
import BaseCapybaraCargoTransferPanel from './BaseCapybaraCargoTransferPanel';

export default function ExtraShipCaptainWorkspace({ roleId }: { readonly roleId: RoleId }) {
  const session = useSessionStore((state) => state.session);
  const me = useSessionStore((state) => state.me);
  const workspace = extraShipCaptainWorkspaceFor(roleId);
  if (!workspace || me?.replacementRoleId !== workspace.roleId) return null;

  const vessel = SMALL_SHIPS.find((entry) => entry.id === workspace.vesselId);
  if (!vessel) return null;
  const state = session?.smallShipStates?.[workspace.vesselId];
  const baseCapybaraAvailable = workspace.vesselId !== 'capybara-small' || (
    session?.expansion !== 'capybara' && session?.expansion !== 'none' && session?.capybaraEnabled !== false
  );
  const hostName = state?.hostShipId
    ? SHIPS.find((ship) => ship.id === state.hostShipId)?.name ?? state.hostShipId
    : 'Awaiting facilitator docking';

  return (
    <section
      className="role-brief__rules extra-ship-workspace"
      aria-label={`${vessel.name} Captain workspace`}
    >
      <p className="eyebrow">Dedicated vessel workspace // {vessel.nationShort}</p>
      <h2 id="extra-ship-workspace-title">{vessel.name} command channel</h2>
      {!baseCapybaraAvailable ? (
        <p role="alert">
          Base Capybara authority unavailable // the current session uses a different Capybara mode.
        </p>
      ) : (
        <>
          <p className="extra-ship-workspace__policy">{workspace.policy}</p>
          <dl className="extra-ship-workspace__telemetry">
            <div><dt>Host</dt><dd>{hostName}</dd></div>
            <div><dt>Survivors</dt><dd>{state?.population.toLocaleString() ?? 'State unavailable'}</dd></div>
            <div><dt>Unrest</dt><dd>{state?.unrest ?? 'State unavailable'}</dd></div>
            <div><dt>Cycle</dt><dd>{state?.cycle.turn ?? session?.currentTurn ?? 'State unavailable'}</dd></div>
            <div><dt>Charges</dt><dd>{state?.cycle.charges.length ? state.cycle.charges.join(' // ') : 'None recorded'}</dd></div>
          </dl>
          <p role="status">
            Vessel procedures loaded // controls appear only when their server authority is connected.
          </p>
          <div className="extra-ship-workspace__actions">
            {workspace.actions.map((action) => {
              const charged = action.charge === 'reactor'
                ? action.id === 'additional-labour'
                  ? state?.cycle.charges.some((charge) => charge.startsWith('additional-labour-')) === true
                  : state?.cycle.charges.includes(action.id) === true
                : null;
              return (
                <article key={action.id} aria-label={`${action.name} procedure`}>
                  <header>
                    <h3>{action.name}</h3>
                    <p>{action.phase} // {action.charge === 'none' ? 'No charge required' : charged ? 'Charged' : 'Not charged'}</p>
                  </header>
                  <p>{action.effect}</p>
                  <p className={action.control === 'live-below' ? 'extra-ship-workspace__available' : 'extra-ship-workspace__unavailable'}>
                    {action.availability}
                  </p>
                </article>
              );
            })}
          </div>
          {workspace.roleId === 'gorgoneion-captain' && <GorgoneionRepairDronesPanel />}
          {workspace.roleId === 'capybara-small-captain' && <BaseCapybaraCargoTransferPanel />}
          {workspace.roleId === 'warrior-captain' && <WarriorRepairDronesPanel />}
        </>
      )}
    </section>
  );
}
