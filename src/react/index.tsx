'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { createConsent, initConsent } from '../core.js';
import type {
  ConsentCategory,
  ConsentInstance,
  ConsentOptions,
  ConsentRecord,
  TrackerDefinition,
} from '../types.js';

export interface ConsentContextValue {
  /** `null` until the provider has mounted on the client. */
  consent: ConsentInstance | null;
  granted: ConsentCategory[];
  record: ConsentRecord | null;
  /** True once the consent UI has mounted and any stored choice was applied. */
  ready: boolean;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export interface ConsentProviderProps extends ConsentOptions {
  children?: ReactNode;
  /**
   * Use an isolated instance instead of the page-wide singleton.
   * Only useful in tests or in a page with multiple independent React roots.
   */
  isolated?: boolean;
}

/**
 * Mounts the consent UI on the client and makes consent state available to the
 * tree. Renders nothing itself, so it is safe at the top of a Next.js
 * `app/layout.tsx`.
 */
export function ConsentProvider({ children, isolated, ...options }: ConsentProviderProps): ReactNode {
  const [consent, setConsent] = useState<ConsentInstance | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<{ granted: ConsentCategory[]; record: ConsentRecord | null }>({
    granted: ['necessary'],
    record: null,
  });

  // Options are read once, at mount. Changing them later is not supported —
  // a consent notice that re-mounts mid-session is a compliance problem, not a feature.
  const optionsRef = useRef(options);
  const isolatedRef = useRef(isolated);

  useEffect(() => {
    let cancelled = false;
    const instance = isolatedRef.current
      ? createConsent(optionsRef.current)
      : initConsent(optionsRef.current);

    setConsent(instance);
    setState({ granted: instance.grantedCategories(), record: instance.getRecord() });

    const unsubscribe = instance.onChange((record, granted) => {
      if (!cancelled) setState({ granted, record });
    });

    instance.ready
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        /* fail closed: `ready` stays false and nothing optional is injected */
      });

    return () => {
      cancelled = true;
      unsubscribe();
      // The singleton deliberately survives unmount so navigating does not
      // re-show the banner. An isolated instance is torn down.
      if (isolatedRef.current) instance.destroy();
    };
  }, []);

  const value = useMemo<ConsentContextValue>(
    () => ({ consent, granted: state.granted, record: state.record, ready }),
    [consent, state.granted, state.record, ready],
  );

  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>;
}

export interface UseConsentResult extends ConsentContextValue {
  isGranted(category: ConsentCategory): boolean;
  hasLoaded(trackerId: string): boolean;
  accept(categories: ConsentCategory[] | 'all' | 'necessary'): void;
  acceptAll(): void;
  rejectAll(): void;
  showBanner(): void;
  showPreferences(): void;
  reset(): void;
}

export function useConsent(): UseConsentResult {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error('useConsent() must be used inside <ConsentProvider>.');
  const { consent, granted } = ctx;

  return useMemo<UseConsentResult>(
    () => ({
      ...ctx,
      isGranted: (category) => granted.includes(category),
      hasLoaded: (trackerId) => consent?.hasLoaded(trackerId) ?? false,
      accept: (categories) => consent?.accept(categories),
      acceptAll: () => consent?.acceptAll(),
      rejectAll: () => consent?.rejectAll(),
      showBanner: () => consent?.showBanner(),
      showPreferences: () => consent?.showPreferences(),
      reset: () => consent?.reset(),
    }),
    [ctx, consent, granted],
  );
}

export interface ConsentGateProps {
  category: ConsentCategory;
  children?: ReactNode;
  /** Shown while the category is not granted — e.g. a "enable cookies to view" placeholder. */
  fallback?: ReactNode;
}

/**
 * Renders `children` only once `category` is granted.
 *
 * For third-party *scripts*, declare a tracker instead — this is for embedded
 * markup (YouTube/Vimeo iframes, map widgets, social embeds).
 */
export function ConsentGate({ category, children, fallback = null }: ConsentGateProps): ReactNode {
  const { granted } = useConsent();
  return granted.includes(category) ? children : fallback;
}

export interface PreferencesButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
}

/**
 * The persistent preference-centre entry point. Put one in the footer of every
 * page — withdrawing must be as easy as granting.
 */
export function PreferencesButton({ children = 'Cookie preferences', ...props }: PreferencesButtonProps): ReactNode {
  const { showPreferences } = useConsent();
  return (
    <button type="button" {...props} onClick={(event) => {
      props.onClick?.(event);
      if (!event.defaultPrevented) showPreferences();
    }}>
      {children}
    </button>
  );
}

/**
 * Declare a tracker from a component. Registration is idempotent, and the
 * tracker still cannot load before its category is granted.
 */
export function useTracker(tracker: TrackerDefinition): void {
  const { consent } = useConsent();
  const ref = useRef(tracker);
  useEffect(() => {
    consent?.registerTracker(ref.current);
  }, [consent]);
}

export type { ConsentCategory, ConsentInstance, ConsentOptions, ConsentRecord, TrackerDefinition };
