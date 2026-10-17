import { enterPreparedRoleStation } from './pc10-political-crisis-arrest-proof-contracts.mjs';

type EnteredRole = Awaited<ReturnType<typeof enterPreparedRoleStation>>;
declare const entered: EnteredRole;

const originalRole = entered.actor.roleId;
const originalUidHash = entered.actor.uidHash;
const currentSessionId = entered.current.sessionId;
const currentUidHash = entered.current.uidHash;
const currentProfileRole = entered.current.profileRoleId;
const sameCurrentActor: boolean = entered.current.sameActor;

void [originalRole, originalUidHash, currentSessionId, currentUidHash, currentProfileRole, sameCurrentActor];
