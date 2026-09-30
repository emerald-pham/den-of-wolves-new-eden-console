import './DemoJumpUnavailableToast.css';

export interface DemoJumpUnavailableToastProps {
  /** Keep the message mounted while the denied Demo jump should be announced. */
  open: boolean;
}

/** On-screen, polite status notice for a jump request denied by Demo mode. */
export function DemoJumpUnavailableToast({ open }: DemoJumpUnavailableToastProps) {
  if (!open) return null;

  return (
    <div className="demo-jump-unavailable-toast" role="status" aria-live="polite" aria-atomic="true">
      Jumps are unavailable in Demo mode.
    </div>
  );
}
