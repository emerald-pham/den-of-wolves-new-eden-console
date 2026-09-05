import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export default function OverflowTicker({ text }: { readonly text: string }) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    const copy = copyRef.current;
    if (!viewport || !copy) return;
    setOverflowing(copy.scrollWidth > viewport.clientWidth);
  }, []);

  useLayoutEffect(() => {
    measure();
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [measure, text]);

  return (
    <span
      ref={viewportRef}
      className="overflow-ticker"
      aria-label={text}
      data-overflow={String(overflowing)}
    >
      <span className="overflow-ticker__track" aria-hidden="true">
        <span ref={copyRef} className="overflow-ticker__copy">{text}</span>
        {overflowing && <span className="overflow-ticker__copy">{text}</span>}
      </span>
    </span>
  );
}
