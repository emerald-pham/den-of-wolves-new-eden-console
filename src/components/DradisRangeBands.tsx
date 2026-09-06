const COMBAT_RANGES = ['LONG', 'MEDIUM', 'SHORT'] as const;

/** The reference combat bands, kept visible only while a DRADIS is expanded. */
export default function DradisRangeBands({ className }: { readonly className: string }) {
  return (
    <aside className={`dradis-range-bands ${className}`} aria-label="Combat range bands">
      <span className="dradis-range-bands__title">COMBAT RANGES</span>
      <span className="dradis-range-bands__separator" aria-hidden="true"> // </span>
      <span className="dradis-range-bands__bands">
        {COMBAT_RANGES.map((range, index) => (
          <span key={range}>
            {index > 0 ? <span className="dradis-range-bands__separator" aria-hidden="true"> // </span> : null}
            {range}
          </span>
        ))}
      </span>
    </aside>
  );
}
