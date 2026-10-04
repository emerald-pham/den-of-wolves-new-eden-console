const SPECIAL_ROLES = new Set(['wolfAgentRoleId', 'wolfCultRoleId', 'intelligenceAgentRoleId']);

/** Build a complete, GM-authored optional loyalty roster for a normal 14+ player setup. */
export function buildPc07ExplicitLoyaltyAssignments(roles, choice) {
 if(!Array.isArray(roles)||roles.length<14||roles.some(role=>typeof role!=='string'||!role)||new Set(roles).size!==roles.length)
  throw new Error('The optional Wolf Cult mode requires a unique two-Wolf setup with at least 14 occupied core roles.');
 if(!choice||typeof choice!=='object'||Array.isArray(choice)||Object.keys(choice).length!==3||
  Object.keys(choice).some(key=>!SPECIAL_ROLES.has(key))||
  [...SPECIAL_ROLES].some(key=>typeof choice[key]!=='string'||!choice[key]))
  throw new Error('Choose one occupied role for Wolf Agent, Wolf Cult, and Intelligence Agent.');
 const chosen=Object.values(choice);
 if(new Set(chosen).size!==3)throw new Error('The special loyalties require three distinct occupied roles.');
 for(const roleId of chosen)if(!roles.includes(roleId))throw new Error(`The special loyalty role is not an occupied core role: ${roleId}.`);
 return roles.map(roleId=>({
  roleId,
  kind:roleId===choice.wolfAgentRoleId?'wolf-agent':
   roleId===choice.wolfCultRoleId?'wolf-cult':
   roleId===choice.intelligenceAgentRoleId?'intelligence-agent':'fleet-loyalist',
  suspicion:roleId===choice.wolfCultRoleId?15:roleId===choice.intelligenceAgentRoleId?6:0,
 }));
}
