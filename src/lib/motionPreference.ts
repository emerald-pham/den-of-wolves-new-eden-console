import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type MotionOverride = 'system' | 'reduce' | 'full';

const STORAGE_KEY = 'new-eden-motion-override';
const CHANGE_EVENT = 'new-eden-motion-preference';

interface MotionPreferenceScopeValue {
  readonly forceReducedMotion: boolean;
  readonly safetyOverride: MotionOverride | null;
}

const MotionPreferenceScope = createContext<MotionPreferenceScopeValue>({
  forceReducedMotion: false,
  safetyOverride: null,
});

export function MotionPreferenceProvider({
  children,
  forceReducedMotion = false,
  safetyOverride = null,
}: MotionPreferenceScopeValue & { readonly children: ReactNode }) {
  return createElement(
    MotionPreferenceScope.Provider,
    { value: { forceReducedMotion, safetyOverride } },
    children,
  );
}

export function useMotionSafetyGatePending(): boolean {
  return useContext(MotionPreferenceScope).forceReducedMotion;
}

const readOverride = (): MotionOverride => {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'reduce' || value === 'full' ? value : 'system';
};

export const hasMotionOverride = (): boolean => {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'reduce' || value === 'full';
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
  const { forceReducedMotion, safetyOverride } = useContext(MotionPreferenceScope);
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

  const effectiveOverride = safetyOverride ?? override;

  return {
    override: effectiveOverride,
    systemReducedMotion,
    reducedMotion: forceReducedMotion
      || effectiveOverride === 'reduce'
      || (effectiveOverride === 'system' && systemReducedMotion),
  };
};
