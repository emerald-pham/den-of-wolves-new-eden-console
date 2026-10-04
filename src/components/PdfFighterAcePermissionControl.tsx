import { useCallback, useEffect, useState } from 'react';
import type { PdfFighterAcePermissionView, PdfFighterAceSourceId } from '@/types/game';
import { getPdfFighterAcePermissionView, grantPdfFighterAcePermission } from '@/lib/pdfFighterAceService';
import { PdfFighterAcePermissionPanel } from './Pc09SpecialistPresenters';

export default function PdfFighterAcePermissionControl({
  sourceId,
  enabled,
  refreshKey = 0,
}: Readonly<{ sourceId: PdfFighterAceSourceId; enabled: boolean; refreshKey?: number }>) {
  const [view, setView] = useState<PdfFighterAcePermissionView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const next = await getPdfFighterAcePermissionView(sourceId);
      setView(next);
      setLoadError(null);
    } catch (cause) {
      setView(null);
      setLoadError(cause instanceof Error ? cause.message : 'Fighter Ace permission is unavailable.');
    }
  }, [enabled, sourceId]);

  useEffect(() => { void refresh(); }, [refresh, refreshKey]);

  if (!enabled) return null;
  if (!view) return <section className="pc09-specialist-panel cic-frame" aria-label="Fighter Ace source permission">
    <p role={loadError ? 'alert' : 'status'}>{loadError ?? 'Checking the current Fighter Ace and attack permission…'}</p>
  </section>;

  return <PdfFighterAcePermissionPanel view={view} onGrant={async (input) => {
    try {
      await grantPdfFighterAcePermission(input);
      await refresh();
    } catch (cause) { throw cause; }
  }} />;
}
