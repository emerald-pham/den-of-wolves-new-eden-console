import { useEffect, useState } from 'react';
import { useSessionStore } from '@/store/useSessionStore';
import { getSessionPresence } from '@/lib/sessionService';

export default function LastPlayerWarning() {
  const session = useSessionStore((state) => state.session);
  const [isLastPlayer, setIsLastPlayer] = useState(false);

  useEffect(() => {
    if (!session) {
      setIsLastPlayer(false);
      return;
    }

    let isMounted = true;

    async function checkPresence() {
      try {
        const presence = await getSessionPresence();
        if (isMounted) {
          setIsLastPlayer(presence.connectedPlayers === 1);
        }
      } catch {
        // If we can't fetch presence, assume not last player
        if (isMounted) {
          setIsLastPlayer(false);
        }
      }
    }

    void checkPresence();

    return () => {
      isMounted = false;
    };
  }, [session]);

  if (!isLastPlayer) return null;

  return (
    <div className="last-player-warning cic-frame">
      <p>
        You're the last player to leave the server. After seven days of
        inactivity, this session will be deleted.
      </p>
    </div>
  );
}
