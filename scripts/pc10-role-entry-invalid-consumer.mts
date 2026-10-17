import { enterPreparedRoleStation } from './pc10-political-crisis-arrest-proof-contracts.mjs';

type EnteredRole = Awaited<ReturnType<typeof enterPreparedRoleStation>>;
declare const entered: EnteredRole;

// Current-only identity observations live on `current`, not admitted `actor` metadata.
entered.actor.sameActor;
