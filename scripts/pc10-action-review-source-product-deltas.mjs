export const ANCHORS = [
  ['delta.warriorCargo.export', 'functions/src/index.ts', 'transferWarriorCargo'],
  ['delta.warriorCargo.writer', 'functions/src/baseCapybaraCargoTransferCallable.ts', 'transferWarriorCargo'],
  ['delta.warriorCargo.factory', 'functions/src/baseCapybaraCargoTransferCallable.ts', 'createSmallShipCargoTransferCallable'],
  ['delta.warriorCargo.calculation', 'functions/src/baseCapybaraCargoTransfer.ts', 'resolveSmallShipCargoTransfer'],
  ['delta.warriorCargo.service', 'src/lib/baseCapybaraCargoService.ts', 'transferWarriorCargo'],
  ['delta.warriorCargo.ui', 'src/components/BaseCapybaraCargoTransferPanel.tsx', 'SmallShipCargoTransferPanel'],
  ['delta.warriorCargo.mount', 'src/components/ExtraShipCaptainWorkspace.tsx', 'ExtraShipCaptainWorkspace'],
  ['delta.warriorCargo.guidance', 'src/data/extraShipCaptainWorkspaces.ts', 'extraShipCaptainWorkspaceFor'],
];

const ids = [
  'delta.warriorCargo.export', 'delta.warriorCargo.writer', 'delta.warriorCargo.factory',
  'delta.warriorCargo.calculation', 'delta.warriorCargo.service', 'delta.warriorCargo.ui',
  'delta.warriorCargo.mount', 'delta.warriorCargo.guidance',
];

export const REVIEWS = [{
  exportName: 'transferWarriorCargo',
  classification: 'served-ui-path',
  productPath: {
    status: 'current-source-served-ui-path; runtime visibility pending',
    surface: 'Warrior Captain workspace Cargo Transfer panel',
    invocation: 'transferWarriorCargo service → exported audited callable → server cargo transaction',
    sourceAnchorIds: ids,
  },
  actor: {
    family: 'unique connected active Warrior Captain replacement holder',
    identities: ['warrior-captain'],
    conditions: [
      'The authenticated member must be the sole current warrior-captain holder, with no replacement status, active core-console role, core seat, or escape state; the assignment must remain current and the member must not be kicked or stale-disconnected.',
    ],
    sourceAnchorIds: [
      'delta.warriorCargo.writer', 'delta.warriorCargo.factory', 'delta.warriorCargo.calculation',
      'delta.warriorCargo.service', 'delta.warriorCargo.ui',
    ],
  },
  requirements: {
    summary: 'Requires an active session, current live Coordination with airspace lifted and no timer pause or expired deadline, a uniquely admitted Warrior docked with the specified active undestroyed core host, no Warrior mutiny, valid matching cycle/host/docking/cargo revisions, one of the six permitted resources, direction load/unload, and a positive whole amount. The source inventory must cover the transfer and the destination must remain within safe integer bounds.',
    sourceAnchorIds: [
      'delta.warriorCargo.writer', 'delta.warriorCargo.factory', 'delta.warriorCargo.calculation',
      'delta.warriorCargo.service', 'delta.warriorCargo.ui',
    ],
  },
  costs: {
    summary: 'No separate game resource, turn slot, fuel, or Reactor charge is consumed. The selected amount itself is moved between Warrior cargo and its current host inventory; the source is debited by exactly that amount.',
    sourceAnchorIds: ['delta.warriorCargo.factory', 'delta.warriorCargo.calculation', 'delta.warriorCargo.guidance'],
  },
  consequences: {
    summary: 'The server atomically updates Warrior cargo at revision +1 and the matching host inventory, writes an actor-bound action audit and request receipt, and returns a committed transfer reply. A stale cargo revision returns a read-only stale result for explicit refresh/retry.',
    sourceAnchorIds: [
      'delta.warriorCargo.writer', 'delta.warriorCargo.factory', 'delta.warriorCargo.calculation',
      'delta.warriorCargo.service',
    ],
  },
  blockers: {
    summary: 'Authorization, kicked/stale/disconnected identity, role-definition or sole-holder mismatch, unavailable/destroyed host, no server-owned admission or dock, mutiny, inactive/wrong/paused/expired Coordination, stale revisions, malformed transfer, insufficient source inventory, or unsafe destination capacity rejects before a fresh write.',
    sourceAnchorIds: [
      'delta.warriorCargo.writer', 'delta.warriorCargo.factory', 'delta.warriorCargo.calculation',
      'delta.warriorCargo.service', 'delta.warriorCargo.ui',
    ],
  },
  nextActor: {
    summary: 'The current Warrior Captain receives the result and may make another eligible transfer using refreshed revisions while Coordination remains open; the endpoint does not schedule a separate player action.',
    sourceAnchorIds: ['delta.warriorCargo.writer', 'delta.warriorCargo.service', 'delta.warriorCargo.ui'],
  },
  guidance: {
    status: 'current-source-guidance-in-role-workspace; visibility pending',
    summary: 'The Warrior Captain procedure states the Coordination timing, positive whole amount, six resource types, host relationship, and absence of Reactor charge. The adjacent control shows the current host, cargo revision, inventory, resource, direction, amount, source availability, connection/authority/dock/host/timing blockers, and exact-retry or stale-revision status.',
    sourceAnchorIds: [
      'delta.warriorCargo.guidance', 'delta.warriorCargo.ui', 'delta.warriorCargo.mount',
      'delta.warriorCargo.service',
    ],
  },
}];
