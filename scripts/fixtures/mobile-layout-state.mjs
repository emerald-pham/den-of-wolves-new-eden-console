const STAMP = '2026-01-01T00:00:00.000Z';

function session(id, ownerUid = 'pc04-player') {
  return {
    id,
    name: 'New Eden typography review',
    joinCode: 'PC04',
    phase: 'active',
    ownerUid,
    createdAt: STAMP,
    updatedAt: STAMP,
    currentTurn: 3,
    activeRoleIds: [
      'admiral', 'executive-officer', 'wing-commander', 'dione-captain',
      'dione-engineer', 'press-officer', 'shepherd-engineer', 'shepherd-scientist',
      'quellon-captain', 'refinery-124-captain',
    ],
    activeVesselIds: ['aegis', 'dione', 'shepherd', 'quellon', 'refinery-124'],
    capybaraEnabled: true,
    dioneEnabled: true,
    pressEnabled: true,
    pressClaimed: false,
    shipGalacticCoordinates: {
      aegis: '0000', dione: '0012', shepherd: '0243', quellon: '1104',
      'refinery-124': '2315',
    },
    shipResources: {
      aegis: { ore: 7, fuel: 12, food: 21, water: 18, materials: 4, securityTeams: 8 },
    },
    shipSurvivors: { aegis: 2500 },
    shipUnrest: { aegis: 3 },
    shipDamage: { aegis: { damagedSystemIds: [], destroyed: false } },
    shipUpgrades: { aegis: [] },
  };
}

function playerState(id, route, { press = false, mission = false, brief = false } = {}) {
  const currentSession = session(id);
  const player = {
    uid: 'pc04-player',
    sessionId: currentSession.id,
    displayName: 'Ari Review',
    role: 'player',
    seatId: press ? 'press-officer' : 'admiral',
    ...(brief ? { assignedRoleId: 'admiral' } : {}),
    ...(press ? { activeConsoleRoleId: 'press-officer' } : {}),
    ...(!press && route.startsWith('/ships/') ? { activeConsoleRoleId: 'admiral' } : {}),
    joinedAt: STAMP,
  };
  const awayMissionHandPointers = mission ? [{
    sessionId: id,
    participantUid: player.uid,
    missionId: 'nightfall-approach',
    handId: 'nightfall-hand-1',
    phase: 'discarding',
    revision: 1,
    discarded: false,
  }] : [];
  const awayMissionHands = mission ? [{
    sessionId: id,
    participantUid: player.uid,
    missionId: 'nightfall-approach',
    handId: 'nightfall-hand-1',
    cardId: 'scout-7',
    rank: 'seven',
    suit: 'clubs',
    value: 7,
    discarded: false,
  }] : [];
  return {
    state: {
      session: currentSession,
      me: player,
      gmInstance: null,
      gmAccessAuthenticatedAt: null,
      pendingCommands: [],
      seats: [
        { id: 'admiral', sessionId: id, roleId: 'admiral', label: 'AEGIS // Admiral', status: 'claimed', holderUid: 'other-player', factionId: 'aegis', claimedAt: STAMP },
        { id: 'dione-engineer', sessionId: id, roleId: 'dione-engineer', label: 'Dione // Engineer', status: 'open', holderUid: null, factionId: 'dione', claimedAt: null },
      ],
      roleBrief: brief ? {
        assignmentUid: player.uid,
        roleId: 'admiral',
        roleName: 'Admiral',
        vesselName: 'AEGIS',
        text: 'Coordinate the fleet and confirm the next operational priority.',
        commonRules: 'Keep private roles and table decisions confidential.',
        ownedCraftIds: ['fighter-wing-alpha'],
        setupRevision: 1,
      } : null,
      awayMissionHandPointer: awayMissionHandPointers[0] ?? null,
      awayMissionHand: awayMissionHands[0] ?? null,
      awayMissionHandPointers,
      awayMissionHands,
      gmAwayMissionHandPointers: [],
      mode: press ? 'press' : 'console',
      lastRoute: route,
    },
    version: 1,
  };
}

function gmState(id, route) {
  const currentSession = session(id, 'pc04-gm');
  const gm = {
    uid: 'pc04-gm', sessionId: id, displayName: 'Facilitator', role: 'gm',
    seatId: null, joinedAt: STAMP,
  };
  return {
    state: {
      session: currentSession,
      me: gm,
      gmInstance: {
        id: 'pc04-gm-instance', sessionId: id, uid: gm.uid,
        name: 'Bridge review', deviceLabel: 'Typography review', claimedAt: STAMP,
      },
      gmAccessAuthenticatedAt: Date.now(),
      pendingCommands: [],
      seats: [],
      gmAwayMissionHandPointers: [{
        sessionId: id, participantUid: 'pc04-player', missionId: 'nightfall-approach',
        handId: 'nightfall-hand-1', phase: 'awaiting-card-selection', revision: 1,
        discarded: false,
      }],
      mode: 'gm',
      lastRoute: route,
    },
    version: 1,
  };
}


export {playerState,gmState};
