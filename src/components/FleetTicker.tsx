import {
  type CSSProperties,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useMotionPreference } from '@/lib/motionPreference';
import './fleetTicker.css';

export interface FleetMessage {
  readonly id: string;
  readonly text: string;
  readonly tone: 'danger' | 'normal';
  readonly pressText?: string | undefined;
  readonly gap?: 'standard' | 'long';
  /** Omit to repeat until replaced. */
  readonly passes?: number;
  readonly expiresAt?: string;
  /** Server-authored lifecycle state cannot be overruled by sessionStorage. */
  readonly serverAuthoritative?: boolean;
}

interface GroupGeometry {
  readonly copyCount: number;
  readonly width: number;
}

interface MovingGroup extends GroupGeometry {
  readonly key: number;
  readonly message: FleetMessage;
  readonly startX: number;
}

type TickerGroupStyle = CSSProperties & {
  '--fleet-ticker-duration': string;
  '--fleet-ticker-group-width': string;
  '--fleet-ticker-start-x': string;
  '--fleet-ticker-copy-width': string;
};

const TICKER_SPEED_PX_PER_SECOND = 48;
const FALLBACK_WINDOW_WIDTH = 320;
const MIN_COPY_WIDTH = 96;

function messageLabel(message: FleetMessage): string {
  return [message.text, message.pressText].filter(Boolean).join(' // ');
}

function messageSignature(message: FleetMessage | undefined): string {
  if (!message) return '';
  return [
    message.id,
    message.text,
    message.tone,
    message.pressText ?? '',
    message.gap ?? 'standard',
    message.passes ?? 'repeat',
    message.expiresAt ?? '',
    message.serverAuthoritative ? 'server' : 'local',
  ].join('\u0000');
}

function hasMessageGroup(groups: readonly MovingGroup[], message: FleetMessage | undefined): boolean {
  return message !== undefined && groups.some((group) => group.message.id === message.id);
}

function storageKey(message: FleetMessage): string {
  return `fleet-ticker:${message.id}`;
}

function readCompletedPasses(message: FleetMessage): number {
  if (message.serverAuthoritative) return 0;
  try {
    return Number(sessionStorage.getItem(storageKey(message))) || 0;
  } catch {
    return 0;
  }
}

function writeCompletedPasses(message: FleetMessage, completed: number): void {
  if (message.serverAuthoritative) return;
  try {
    sessionStorage.setItem(storageKey(message), String(completed));
  } catch {
    // Storage may be disabled.
  }
}

function MessageCopy({ message, copyRef }: {
  readonly message: FleetMessage;
  readonly copyRef?: Ref<HTMLSpanElement>;
}) {
  return (
    <span ref={copyRef} className="fleet-ticker__copy">
      {message.text}<span className="fleet-ticker__separator"> // </span>
      {message.pressText && (
        <span className="fleet-ticker__press">
          {message.pressText}<span className="fleet-ticker__separator"> // </span>
        </span>
      )}
    </span>
  );
}

function StationaryMessage({ message, fallback, queue = [] }: {
  readonly message: FleetMessage;
  readonly fallback?: FleetMessage;
  readonly queue?: readonly FleetMessage[];
}) {
  const [completed, setCompleted] = useState(() => readCompletedPasses(message));
  const [expired, setExpired] = useState(false);
  const done = expired || (message.passes !== undefined && completed >= message.passes);

  useEffect(() => {
    if (!message.expiresAt) return undefined;
    const remaining = Math.max(0, Date.parse(message.expiresAt) - Date.now());
    const timer = window.setTimeout(() => setExpired(true), remaining);
    return () => window.clearTimeout(timer);
  }, [message.expiresAt]);

  useEffect(() => {
    if (done || message.passes === undefined) return;
    const timer = window.setInterval(() => setCompleted((value) => value + 1), 30_000);
    return () => window.clearInterval(timer);
  }, [done, message.passes]);

  useEffect(() => {
    if (message.passes === undefined) return;
    writeCompletedPasses(message, completed);
  }, [completed, message]);

  if (done) {
    const next = fallback ?? queue[0];
    return next
      ? <StationaryMessage key={messageSignature(next)} message={next}
          {...(queue.length === 0 ? {} : {
            queue: fallback ? queue : queue.slice(1),
          })} />
      : null;
  }

  return (
    <aside className="fleet-ticker" aria-label="Fleet broadcasts"
      data-tone={message.tone} data-gap={message.gap ?? 'standard'} data-reduced="true">
      <div className="fleet-ticker__window" role="status" aria-label={messageLabel(message)}
        aria-live="polite" aria-atomic="true">
        <p className="fleet-ticker__message">
          {message.text}
          {message.pressText && <span className="fleet-ticker__press"> // {message.pressText}</span>}
        </p>
      </div>
    </aside>
  );
}

function MovingMessage({ message, fallback, queue = [] }: {
  readonly message?: FleetMessage;
  readonly fallback?: FleetMessage;
  readonly queue?: readonly FleetMessage[];
}) {
  const windowRef = useRef<HTMLDivElement>(null);
  const messageProbeRef = useRef<HTMLSpanElement>(null);
  const fallbackProbeRef = useRef<HTMLSpanElement>(null);
  const queueProbeRefs = useRef(new Map<string, HTMLSpanElement>());
  const groupElements = useRef(new Map<number, HTMLSpanElement>());
  const groupsRef = useRef<readonly MovingGroup[]>([]);
  const activeMessage = useRef<FleetMessage | undefined>(undefined);
  const sequence = useRef(0);
  const input = useRef({ message, fallback, queue });
  input.current = { message, fallback, queue };
  const inputKey = [message, fallback, ...queue].map(messageSignature).join('\u0001');
  const [processedKey, setProcessedKey] = useState<string | null>(null);
  const [groups, setGroupsState] = useState<readonly MovingGroup[]>([]);
  const [announcedMessage, setAnnouncedMessage] = useState<FleetMessage | undefined>();
  const [expiredId, setExpiredId] = useState<string | undefined>();

  useEffect(() => {
    if (!message?.expiresAt) {
      setExpiredId(undefined);
      return undefined;
    }
    const remaining = Math.max(0, Date.parse(message.expiresAt) - Date.now());
    const timer = window.setTimeout(() => setExpiredId(message.id), remaining);
    return () => window.clearTimeout(timer);
  }, [message?.expiresAt, message?.id]);

  const setGroups = useCallback((next: readonly MovingGroup[]) => {
    groupsRef.current = next;
    setGroupsState(next);
  }, []);

  const windowWidth = useCallback(() => {
    const element = windowRef.current;
    return element?.clientWidth
      || element?.getBoundingClientRect().width
      || FALLBACK_WINDOW_WIDTH;
  }, []);

  const geometryFor = useCallback((
    nextMessage: FleetMessage,
    probe: HTMLSpanElement | null,
  ): GroupGeometry => {
    const availableWidth = windowWidth();
    const measuredWidth = Math.max(
      probe?.scrollWidth || 0,
      probe?.getBoundingClientRect().width || 0,
    );
    const separatorAllowance = nextMessage.gap === 'long'
      ? Math.min(320, availableWidth * 0.48)
      : 44;
    const estimatedWidth = messageLabel(nextMessage).length * 8 + separatorAllowance;
    const copyWidth = Math.max(MIN_COPY_WIDTH, measuredWidth || estimatedWidth);
    const copyCount = Math.max(2, Math.ceil(availableWidth / copyWidth) + 1);
    return { copyCount, width: copyWidth * copyCount };
  }, [windowWidth]);

  const probeFor = useCallback((nextMessage: FleetMessage) => (
    messageSignature(nextMessage) === messageSignature(input.current.fallback)
      ? fallbackProbeRef.current
      : messageSignature(nextMessage) === messageSignature(input.current.message)
        ? messageProbeRef.current
        : queueProbeRefs.current.get(nextMessage.id) ?? null
  ), []);

  const relativeRight = useCallback((group: MovingGroup): number => {
    const element = groupElements.current.get(group.key);
    const frame = windowRef.current?.getBoundingClientRect();
    const bounds = element?.getBoundingClientRect();
    if (frame && bounds && (bounds.width > 0 || bounds.height > 0)) {
      return bounds.right - frame.left;
    }
    return group.startX + group.width;
  }, []);

  const appendGroups = useCallback((
    base: readonly MovingGroup[],
    nextMessage: FleetMessage,
    count: number,
    geometry: GroupGeometry,
  ): readonly MovingGroup[] => {
    if (count <= 0) return base;
    let startX = Math.max(windowWidth(), ...base.map(relativeRight));
    const appended: MovingGroup[] = [];
    for (let index = 0; index < count; index += 1) {
      appended.push({
        key: sequence.current,
        message: nextMessage,
        startX,
        ...geometry,
      });
      sequence.current += 1;
      startX += geometry.width;
    }
    return [...base, ...appended];
  }, [relativeRight, windowWidth]);

  const isOnScreen = useCallback((group: MovingGroup): boolean => {
    const element = groupElements.current.get(group.key);
    const frame = windowRef.current?.getBoundingClientRect();
    const bounds = element?.getBoundingClientRect();
    if (!frame || !bounds || (bounds.width === 0 && bounds.height === 0)) return true;
    return bounds.right > frame.left && bounds.left < frame.right;
  }, []);

  useLayoutEffect(() => {
    const { message: inputMessage, fallback: requestedFallback, queue } = input.current;
    const requestedMessage = inputMessage?.id === expiredId ? undefined : inputMessage;
    // An expired finite notice leaves its visible tail in place, then returns
    // to the server-provided fallback before any lower-priority queue item.
    let nextMessage = requestedMessage ?? requestedFallback ?? queue[0];
    if (nextMessage?.passes !== undefined
      && readCompletedPasses(nextMessage) >= nextMessage.passes) {
      nextMessage = requestedFallback ?? queue[0];
    }

    let nextGroups: readonly MovingGroup[] = groupsRef.current.filter(isOnScreen);
    const currentChanged = messageSignature(activeMessage.current) !== messageSignature(nextMessage);
    const outgoingMessage = activeMessage.current;
    if (currentChanged) {
      activeMessage.current = nextMessage;
      if (nextMessage || nextGroups.length === 0) {
        setAnnouncedMessage(nextMessage);
      } else {
        setAnnouncedMessage(outgoingMessage);
      }
    } else {
      // Queue-only updates must still be reconciled while the announced
      // current identity remains stable.
      setAnnouncedMessage(nextMessage);
    }

    if (nextMessage && !hasMessageGroup(nextGroups, nextMessage)) {
      const geometry = geometryFor(nextMessage, probeFor(nextMessage));
      const completed = readCompletedPasses(nextMessage);
      const passCount = nextMessage.passes === undefined
        ? 2
        : Math.max(0, nextMessage.passes - completed);
      nextGroups = appendGroups(nextGroups, nextMessage, passCount, geometry);

    }
    if (nextMessage?.passes !== undefined && requestedFallback &&
        !hasMessageGroup(nextGroups, requestedFallback)) {
      const fallbackGeometry = geometryFor(requestedFallback, fallbackProbeRef.current);
      nextGroups = appendGroups(nextGroups, requestedFallback, 2, fallbackGeometry);
    }

    const queuedAfterCurrent = queue.filter((queuedMessage) =>
      queuedMessage.id !== nextMessage?.id);
    for (const queuedMessage of queuedAfterCurrent) {
      if (hasMessageGroup(nextGroups, queuedMessage)) continue;
      const geometry = geometryFor(queuedMessage, probeFor(queuedMessage));
      const completed = readCompletedPasses(queuedMessage);
      const passCount = queuedMessage.passes === undefined
        ? 2 : Math.max(0, queuedMessage.passes - completed);
      nextGroups = appendGroups(nextGroups, queuedMessage, passCount, geometry);
    }

    setGroups(nextGroups);
    setProcessedKey(inputKey);
  }, [appendGroups, expiredId, geometryFor, inputKey, isOnScreen, probeFor, setGroups]);

  const finishGroup = useCallback((key: number) => {
    const ended = groupsRef.current.find((group) => group.key === key);
    if (!ended) return;

    let nextGroups: readonly MovingGroup[] = groupsRef.current.filter(
      (group) => group.key !== key,
    );
    groupElements.current.delete(key);

    if (ended.message.passes !== undefined) {
      const completed = readCompletedPasses(ended.message) + 1;
      writeCompletedPasses(ended.message, completed);
      if (completed >= ended.message.passes
        && messageSignature(activeMessage.current) === messageSignature(ended.message)) {
        const nextMessage = input.current.fallback ?? input.current.queue[0];
        activeMessage.current = nextMessage;
        setAnnouncedMessage(nextMessage);
        if (nextMessage && !nextGroups.some((group) => (
          messageSignature(group.message) === messageSignature(nextMessage)
        ))) {
          const geometry = geometryFor(nextMessage, fallbackProbeRef.current);
          nextGroups = appendGroups(nextGroups, nextMessage, 2, geometry);
        }
      }
    }

    const active = activeMessage.current;
    if (active && active.passes === undefined
      && messageSignature(active) === messageSignature(ended.message)) {
      const activeCount = nextGroups.filter((group) => (
        messageSignature(group.message) === messageSignature(active)
      )).length;
      const geometry = geometryFor(active, probeFor(active));
      nextGroups = appendGroups(nextGroups, active, Math.max(0, 2 - activeCount), geometry);
    }

    if (nextGroups.length === 0 && activeMessage.current === undefined) {
      setAnnouncedMessage(undefined);
    }

    setGroups(nextGroups);
  }, [appendGroups, geometryFor, probeFor, setGroups]);

  const waitingForLayout = processedKey !== inputKey;
  if (!announcedMessage && groups.length === 0 && !waitingForLayout) {
    return null;
  }

  return (
    <aside className="fleet-ticker" aria-label="Fleet broadcasts"
      data-tone={announcedMessage?.tone ?? 'normal'}
      data-gap={announcedMessage?.gap ?? 'standard'} data-reduced="false">
      <div ref={windowRef} className="fleet-ticker__window"
        {...(announcedMessage
          ? {
              role: 'status',
              'aria-label': messageLabel(announcedMessage),
              'aria-live': 'polite' as const,
              'aria-atomic': true,
            }
          : {})}>
        <div className="fleet-ticker__track" aria-hidden="true">
          {groups.map((group) => {
            const distance = group.startX + group.width;
            const style: TickerGroupStyle = {
              '--fleet-ticker-duration': `${distance / TICKER_SPEED_PX_PER_SECOND}s`,
              '--fleet-ticker-group-width': `${group.width}px`,
              '--fleet-ticker-start-x': `${group.startX}px`,
              '--fleet-ticker-copy-width': `${group.width / group.copyCount}px`,
            };
            return (
              <span className="fleet-ticker__group" data-message-id={group.message.id}
                data-tone={group.message.tone} data-gap={group.message.gap ?? 'standard'}
                key={group.key} style={style}
                ref={(element) => {
                  if (element) groupElements.current.set(group.key, element);
                  else groupElements.current.delete(group.key);
                }}
                onAnimationEnd={() => finishGroup(group.key)}>
                {Array.from({ length: group.copyCount }, (_, index) => (
                  <MessageCopy message={group.message} key={index} />
                ))}
              </span>
            );
          })}
        </div>
        {message && (
          <span className="fleet-ticker__probe" data-tone={message.tone}
            data-gap={message.gap ?? 'standard'} aria-hidden="true">
            <MessageCopy message={message} copyRef={messageProbeRef} />
          </span>
        )}
        {fallback && (
          <span className="fleet-ticker__probe" data-tone={fallback.tone}
            data-gap={fallback.gap ?? 'standard'} aria-hidden="true">
            <MessageCopy message={fallback} copyRef={fallbackProbeRef} />
          </span>
        )}
        {queue.map((queuedMessage) => (
          <span className="fleet-ticker__probe" data-tone={queuedMessage.tone}
            data-gap={queuedMessage.gap ?? 'standard'} aria-hidden="true"
            key={queuedMessage.id}>
            <MessageCopy message={queuedMessage} copyRef={(element) => {
              if (element) queueProbeRefs.current.set(queuedMessage.id, element);
              else queueProbeRefs.current.delete(queuedMessage.id);
            }} />
          </span>
        ))}
      </div>
    </aside>
  );
}

/** Shared viewport surface for alert and press messages; identity owns playback. */
export default function FleetTicker({ message, fallback, queue = [] }: {
  readonly message?: FleetMessage;
  readonly fallback?: FleetMessage;
  readonly queue?: readonly FleetMessage[];
}) {
  const { reducedMotion } = useMotionPreference();
  if (reducedMotion) {
    return message
      ? <StationaryMessage key={messageSignature(message)} message={message}
          {...(fallback === undefined ? {} : { fallback })}
          {...(queue.length === 0 ? {} : { queue })} />
      : null;
  }
  return <MovingMessage {...(message === undefined ? {} : { message })}
    {...(fallback === undefined ? {} : { fallback })}
    {...(queue.length === 0 ? {} : { queue })} />;
}
