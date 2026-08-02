import { ConsentEngine } from './engine.js';
import { assertCompliantOptions, ConsentConfigError } from './guards.js';
import { LegacyEventBridge } from './legacy.js';
import { CookieConsentUi } from './ui-cookieconsent.js';
import {
  CONSENT_CATEGORIES,
  type ConsentCategory,
  type ConsentChangeListener,
  type ConsentInstance,
  type ConsentOptions,
  type ConsentRecord,
  type ConsentUiAdapter,
  type TrackerDefinition,
} from './types.js';

class Consent implements ConsentInstance {
  readonly ready: Promise<void>;

  private readonly engine: ConsentEngine;
  private readonly bridge: LegacyEventBridge | null;
  private readonly ui: ConsentUiAdapter;
  private readonly options: ConsentOptions;
  private readonly listeners = new Set<ConsentChangeListener>();
  private destroyed = false;

  constructor(options: ConsentOptions) {
    assertCompliantOptions(options);
    this.options = options;

    this.engine = new ConsentEngine({ reloadOnRevoke: options.reloadOnRevoke });
    this.bridge =
      options.legacyEvents === false ? null : new LegacyEventBridge(options.legacyEvents ?? {});
    this.ui = options.ui ?? new CookieConsentUi();

    // Registering never injects — that only happens inside applyConsent().
    for (const tracker of options.trackers ?? []) this.engine.register(tracker);

    if (options.onChange) this.listeners.add(options.onChange);

    this.ready = this.ui
      .mount({
        options,
        categories: CONSENT_CATEGORIES,
        onConsent: (granted, record) => this.handleConsent(granted, record),
      })
      .catch((error) => {
        // A failed CMP must fail closed: nothing gets injected.
        // eslint-disable-next-line no-console
        console.error('[consent-gate] failed to mount the consent UI; all optional trackers stay blocked.', error);
        throw error;
      });

    // `await consent.ready` still surfaces the failure, but attaching a handler
    // here stops a vanilla caller that ignores `ready` from producing an
    // unhandled rejection.
    this.ready.catch(() => {});
  }

  private handleConsent(granted: ConsentCategory[], record: ConsentRecord | null): void {
    if (this.destroyed) return;
    this.engine.applyConsent(granted, record);
    const effective = this.engine.grantedCategories();
    this.bridge?.notify(effective, this.engine.getRecord());
    for (const listener of this.listeners) {
      try {
        listener(this.engine.getRecord(), effective);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[consent-gate] onChange listener threw:', error);
      }
    }
  }

  isGranted(category: ConsentCategory): boolean {
    return this.engine.isGranted(category);
  }

  grantedCategories(): ConsentCategory[] {
    return this.engine.grantedCategories();
  }

  hasLoaded(trackerId: string): boolean {
    return this.engine.hasLoaded(trackerId);
  }

  getRecord(): ConsentRecord | null {
    return this.engine.getRecord();
  }

  registerTracker(tracker: TrackerDefinition): void {
    this.engine.register(tracker);
  }

  accept(categories: ConsentCategory[] | 'all' | 'necessary'): void {
    if (categories === 'all') return this.acceptAll();
    if (categories === 'necessary') return this.rejectAll();
    const invalid = categories.filter((c) => !CONSENT_CATEGORIES.includes(c));
    if (invalid.length) throw new ConsentConfigError(`Unknown categories: ${invalid.join(', ')}`);
    this.ui.setCategories(['necessary', ...categories]);
  }

  acceptAll(): void {
    this.ui.setCategories([...CONSENT_CATEGORIES]);
  }

  rejectAll(): void {
    this.ui.setCategories(['necessary']);
  }

  showBanner(): void {
    this.ui.showBanner();
  }

  showPreferences(): void {
    this.ui.showPreferences();
  }

  reset(): void {
    this.bridge?.reset();
    this.ui.reset(true);
  }

  onChange(listener: ConsentChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.destroyed = true;
    this.listeners.clear();
    this.ui.destroy?.();
    this.engine.destroy();
    if (getSingleton() === (this as ConsentInstance)) setSingleton(null);
  }
}

/**
 * The page-wide instance lives on `globalThis`, not in a module variable.
 *
 * A bundler can easily end up with two copies of this module — the vanilla
 * entry and the React entry, or two versions hoisted differently — and two
 * module-scoped singletons would mean two consent banners and two independent
 * gates. Keying off a well-known symbol makes duplicate copies share one.
 */
const SINGLETON_KEY = Symbol.for('consent-gate.instance');

type SingletonHolder = { [SINGLETON_KEY]?: ConsentInstance | null };

function getSingleton(): ConsentInstance | null {
  return (globalThis as SingletonHolder)[SINGLETON_KEY] ?? null;
}

function setSingleton(instance: ConsentInstance | null): void {
  (globalThis as SingletonHolder)[SINGLETON_KEY] = instance;
}

/**
 * Create an isolated consent instance. Prefer {@link initConsent} in apps —
 * this exists for tests and for multi-root pages.
 */
export function createConsent(options: ConsentOptions): ConsentInstance {
  return new Consent(options);
}

/**
 * Initialise the page-wide consent instance. Safe to call more than once
 * (React StrictMode double-mounts, hot reload): later calls return the
 * existing instance instead of mounting a second banner.
 */
export function initConsent(options: ConsentOptions): ConsentInstance {
  const existing = getSingleton();
  if (existing) {
    for (const tracker of options.trackers ?? []) existing.registerTracker(tracker);
    return existing;
  }
  const instance = new Consent(options);
  setSingleton(instance);
  return instance;
}

/** The current page-wide instance, or `null` before {@link initConsent}. */
export function getConsent(): ConsentInstance | null {
  return getSingleton();
}

/**
 * Type-only helper so tracker arrays keep their literal types without a cast.
 * Validation still happens at registration.
 */
export function defineTrackers<T extends readonly TrackerDefinition[]>(trackers: T): T {
  return trackers;
}
