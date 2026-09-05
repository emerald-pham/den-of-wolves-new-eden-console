import { useEffect, useState } from 'react';

export type MotionOverride = 'system' | 'reduce' | 'full';

const STORAGE_KEY = 'new-eden-motion-override';
const CHANGE_EVENT = 'new-eden-motion-preference';

const readOverride = (): MotionOverride => {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'reduce' || value === 'full' ? value : 'system';
};

export const systemPrefersReducedMotion = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export const setMotionOverride = (override: MotionOverride): void => {
  if (override === 'system') window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, override);
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const useMotionPreference = (): {
  readonly override: MotionOverride;
  readonly systemReducedMotion: boolean;
  readonly reducedMotion: boolean;
} => {
  const [override, setOverride] = useState<MotionOverride>(readOverride);
  const [systemReducedMotion, setSystemReducedMotion] = useState(systemPrefersReducedMotion);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const updateOverride = () => setOverride(readOverride());
    const updateSystem = (event: MediaQueryListEvent) => setSystemReducedMotion(event.matches);
    window.addEventListener(CHANGE_EVENT, updateOverride);
    media?.addEventListener?.('change', updateSystem);
    return () => {
      window.removeEventListener(CHANGE_EVENT, updateOverride);
      media?.removeEventListener?.('change', updateSystem);
    };
  }, []);

  return {
    override,
    systemReducedMotion,
    reducedMotion: override === 'reduce' || (override === 'system' && systemReducedMotion),
  };
};
