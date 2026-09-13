import { useEffect, useRef, useState, type ElementType } from 'react';

interface LiveChangeRegionProps {
  readonly as?: ElementType;
  readonly changeKey: string | null | undefined;
  readonly message: string;
  readonly role?: 'status' | 'alert' | null;
  readonly politeness?: 'polite' | 'assertive';
  readonly atomic?: boolean;
  readonly announceInitial?: boolean;
  readonly className?: string;
}

/**
 * Keeps one live region stable while listener snapshots reconcile.
 * A message is announced only when its caller-provided event identity changes.
 */
export default function LiveChangeRegion({
  as: Element = 'span',
  changeKey,
  message,
  role = 'status',
  politeness = 'polite',
  atomic = true,
  announceInitial = false,
  className,
}: LiveChangeRegionProps) {
  const previousKey = useRef<string | null>(null);
  const hasSeenKey = useRef(false);
  const hasMounted = useRef(false);
  const [announcedMessage, setAnnouncedMessage] = useState(
    announceInitial ? '' : message,
  );
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (changeKey === null || changeKey === undefined) {
      previousKey.current = null;
      hasMounted.current = true;
      setLive(false);
      if (announceInitial) setAnnouncedMessage('');
      return;
    }

    if (previousKey.current === changeKey) return;
    const firstKey = previousKey.current === null;
    previousKey.current = changeKey;
    const shouldAnnounce = announceInitial || hasSeenKey.current || (firstKey && hasMounted.current) || !firstKey;
    hasSeenKey.current = true;
    hasMounted.current = true;
    setAnnouncedMessage(message);
    setLive(shouldAnnounce);
  }, [announceInitial, changeKey, message]);

  return (
    <Element
      className={className}
      {...(announcedMessage
        ? {
            ...(role ? { role } : {}),
            'aria-live': live ? politeness : 'off',
            'aria-atomic': atomic,
          }
        : {
            'aria-live': 'off',
            'aria-atomic': atomic,
            'aria-hidden': true,
          })}
    >
      {announcedMessage}
    </Element>
  );
}
