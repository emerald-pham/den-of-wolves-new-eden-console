export type TeamStartFormalAnnouncement = Readonly<{
  id: string;
  kind: 'binding-resolution' | 'presidential-election';
  title: string;
  details: string;
  decidedCycle: number;
}>;

function parseAnnouncement(value: unknown): TeamStartFormalAnnouncement | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (Object.keys(raw).some((key) => !['id', 'kind', 'title', 'details', 'decidedCycle'].includes(key)) ||
      typeof raw.id !== 'string' || !/^[\w-]{1,160}$/.test(raw.id) ||
      (raw.kind !== 'binding-resolution' && raw.kind !== 'presidential-election') ||
      typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 120 ||
      typeof raw.details !== 'string' || !raw.details.trim() || raw.details.length > 700 ||
      !Number.isSafeInteger(raw.decidedCycle) || Number(raw.decidedCycle) < 1) return null;
  return {
    id: raw.id,
    kind: raw.kind,
    title: raw.title.trim(),
    details: raw.details.trim(),
    decidedCycle: Number(raw.decidedCycle),
  };
}

export function parsePendingTeamAnnouncements(value: unknown): readonly TeamStartFormalAnnouncement[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) return null;
  const parsed = value.map(parseAnnouncement);
  if (parsed.some((announcement) => announcement === null)) return null;
  const announcements = parsed as TeamStartFormalAnnouncement[];
  if (new Set(announcements.map(({ id }) => id)).size !== announcements.length) return null;
  return announcements;
}

export function appendPendingTeamAnnouncement(
  current: unknown,
  announcement: unknown,
): readonly TeamStartFormalAnnouncement[] | null {
  const parsedCurrent = parsePendingTeamAnnouncements(current);
  const parsedAnnouncement = parseAnnouncement(announcement);
  if (!parsedCurrent || !parsedAnnouncement || parsedCurrent.length >= 20 ||
      parsedCurrent.some(({ id }) => id === parsedAnnouncement.id)) return null;
  return [...parsedCurrent, parsedAnnouncement];
}
