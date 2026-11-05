export interface PreparedRoleActorMetadata {
  readonly actorKind: 'player';
  readonly sessionId: string;
  readonly uidHash: string;
  readonly roleId: string;
}

export interface CurrentRoleSnapshot {
  readonly sameActor: true;
  readonly sessionId: string;
  readonly uidHash: string;
  readonly playerRole: 'player';
  readonly profileRoleId: string;
  readonly assignedRoleId: string | null;
  readonly activeConsoleRoleId: string;
  readonly cycle: number;
  readonly phase: string;
  readonly turnStatePhase: string;
  readonly connection: 'live';
  readonly freshness: 'server';
}

export interface PreparedRoleEntry {
  readonly actor: PreparedRoleActorMetadata;
  readonly current: CurrentRoleSnapshot;
}
