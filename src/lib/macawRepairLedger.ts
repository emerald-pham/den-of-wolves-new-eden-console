import { parseMacawRepairLedger as parseAuthoritativeLedger } from '../../functions/src/macawRepair';
import { memberPhiliaRepairLedger } from '../../functions/src/memberSession';
import type { MacawRepairLedger } from '@/types/game';

/** Preserve strict local deck validation while accepting a redacted usage count. */
export function parseMacawRepairLedger(value: unknown): MacawRepairLedger | null {
  const member = memberPhiliaRepairLedger(value);
  if (member?.totalHostsUsed === undefined) return parseAuthoritativeLedger(value) as MacawRepairLedger | null;
  const hosts: MacawRepairLedger['hosts'][number][] = [];
  for (const host of member.hosts) {
    const validated = parseAuthoritativeLedger({ cycle: member.cycle, revision: member.revision, hosts: [host] });
    if (!validated) return null;
    hosts.push(validated.hosts[0] as MacawRepairLedger['hosts'][number]);
  }
  return { ...member, hosts };
}
