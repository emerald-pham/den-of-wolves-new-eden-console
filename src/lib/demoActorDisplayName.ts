/** Public labels for the explicitly disclosed simulated crew. */
export function demoActorDisplayName(roleId: string): string {
  if (roleId === 'joint-engineering-quellon-refinery') return 'DEMO // Union Quellon/Refinery';
  if (roleId === 'joint-engineering-shepherd-icebreaker') return 'DEMO // Union Shepherd/Icebreaker';
  return `DEMO // ${roleId}`;
}
