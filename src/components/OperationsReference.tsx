import { useId, useRef, useState, type ReactNode } from 'react';
import './OperationsReference.css';

export default function OperationsReference({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  return <div className="operations-reference" onKeyDown={event => {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault();
    event.stopPropagation();
    setExpanded(false);
    toggle.current?.focus();
  }}>
    <button ref={toggle} type="button" className="cic-action-button operations-reference__toggle"
      aria-label="Operations reference" aria-expanded={expanded} aria-controls={contentId}
      onClick={() => setExpanded(value => !value)}>
      <span>Operations reference</span><span aria-hidden="true">{expanded ? 'Close' : 'Open'}</span>
    </button>
    <div id={contentId} className="operations-reference__content" hidden={!expanded}>{children}</div>
  </div>;
}
