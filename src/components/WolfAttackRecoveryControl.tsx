interface Props {
  readonly available: boolean;
  readonly busy: boolean;
  readonly reason: string;
  readonly confirmed: boolean;
  readonly onReason: (reason:string)=>void;
  readonly onConfirm: (confirmed:boolean)=>void;
  readonly onRecover: ()=>void;
}

/** The current GM recovery form; its parent owns revision and native authority. */
export default function WolfAttackRecoveryControl({available,busy,reason,confirmed,onReason,onConfirm,onRecover}:Props) {
  return <details className="gm-wolf-preparation__recovery">
    <summary className="cic-action-button">Attack progress recovery</summary>
    <p className="gm-console__hint">
      Use only to retry legal server progress. Pending player choices, shared holds
      and current deadlines still govern this command.
    </p>
    <label className="gm-wolf-preparation__field gm-wolf-preparation__notes">
      <span>Attack recovery reason // 8–400 characters</span>
      <textarea aria-label="Attack recovery reason" rows={2} minLength={8} maxLength={400}
        value={reason} disabled={!available||busy} onChange={event=>onReason(event.target.value)} />
    </label>
    <label className="gm-wolf-preparation__check">
      <input type="checkbox" checked={confirmed} disabled={!available||busy}
        onChange={event=>onConfirm(event.target.checked)} />
      <span>I confirm advancing the resolved targeting stage into Long Range.</span>
    </label>
    <p className="gm-console__hint">
      The private audit records this reason and the before/after revision, stage and deadline.
      Committed rolls and player choices cannot be rolled back.
    </p>
    <button className="cic-action-button" type="button"
      disabled={!available||busy||reason.trim().length<8||reason.trim().length>400||!confirmed}
      onClick={onRecover}>
      {busy?'Entering Long Range…':'Recover targeting progress'}
    </button>
  </details>;
}
