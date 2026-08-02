import { assertGranted, assertValidTracker, ConsentConfigError } from './guards.js';
import type { ConsentCategory, ConsentRecord, TrackerDefinition } from './types.js';

export const TRACKER_ATTR = 'data-consent-tracker';
export const CATEGORY_ATTR = 'data-consent-category';

export interface EngineOptions {
  /** Remove injected nodes and re-allow injection after a withdrawal. */
  reloadOnRevoke?: boolean;
  /** Injected for tests. Defaults to `globalThis.document`. */
  document?: Document;
  /** Injected for tests. Defaults to a `location.reload()` call. */
  reload?: () => void;
  onError?: (error: unknown, tracker: TrackerDefinition) => void;
}

/**
 * The gate.
 *
 * Holds every declared tracker and is the only thing in the package that
 * touches the DOM to load one. `register()` never injects. Injection happens
 * exclusively inside `applyConsent()`, behind `assertGranted()`.
 */
export class ConsentEngine {
  private readonly trackers = new Map<string, TrackerDefinition>();
  private readonly granted = new Set<ConsentCategory>(['necessary']);
  private readonly loaded = new Set<string>();
  private readonly nodes = new Map<string, Element>();
  private readonly options: EngineOptions;

  /** Set once the first consent state (stored or fresh) has been applied. */
  private decided = false;
  private record: ConsentRecord | null = null;

  constructor(options: EngineOptions = {}) {
    this.options = options;
  }

  private get doc(): Document | undefined {
    return this.options.document ?? (typeof document !== 'undefined' ? document : undefined);
  }

  /**
   * Declare a tracker. Deliberately returns nothing: there is no element, no
   * promise and no handle for the caller to force-load with.
   */
  register(tracker: TrackerDefinition): void {
    assertValidTracker(tracker);
    if (this.trackers.has(tracker.id)) {
      const existing = this.trackers.get(tracker.id) as TrackerDefinition;
      if (existing.category !== tracker.category || existing.src !== tracker.src) {
        throw new ConsentConfigError(
          `Tracker id "${tracker.id}" is already registered with a different definition.`,
        );
      }
      return;
    }
    this.trackers.set(tracker.id, tracker);

    // Late registration after consent was already given is legitimate — the
    // user already said yes to this category.
    if (this.decided && this.granted.has(tracker.category)) {
      this.inject(tracker);
    }
  }

  has(trackerId: string): boolean {
    return this.trackers.has(trackerId);
  }

  hasLoaded(trackerId: string): boolean {
    return this.loaded.has(trackerId);
  }

  isGranted(category: ConsentCategory): boolean {
    return this.granted.has(category);
  }

  grantedCategories(): ConsentCategory[] {
    return [...this.granted];
  }

  getRecord(): ConsentRecord | null {
    return this.record;
  }

  hasDecided(): boolean {
    return this.decided;
  }

  /** Ids of every tracker actually injected into the page. Used by tests/audits. */
  loadedTrackerIds(): string[] {
    return [...this.loaded];
  }

  /**
   * Apply a consent state. Idempotent: calling it repeatedly with the same
   * categories injects nothing new.
   *
   * @returns `true` when a previously granted category was withdrawn.
   */
  applyConsent(grantedCategories: ConsentCategory[], record: ConsentRecord | null): boolean {
    const next = new Set<ConsentCategory>(['necessary', ...grantedCategories]);
    const revoked = [...this.granted].filter((c) => c !== 'necessary' && !next.has(c));
    const added = [...next].filter((c) => !this.granted.has(c));

    this.record = record;

    for (const category of revoked) this.granted.delete(category);
    for (const category of added) this.granted.add(category);
    this.decided = true;

    for (const tracker of this.trackers.values()) {
      if (this.granted.has(tracker.category)) this.inject(tracker);
    }

    let revokedSomethingLoaded = false;
    for (const category of revoked) {
      for (const tracker of this.trackers.values()) {
        if (tracker.category !== category) continue;
        if (this.unload(tracker)) revokedSomethingLoaded = true;
      }
    }

    if (revokedSomethingLoaded && this.options.reloadOnRevoke !== false) {
      this.reload();
    }
    return revokedSomethingLoaded;
  }

  /**
   * The single injection site in the package.
   * Private on purpose — nothing outside the engine can call it.
   */
  private inject(tracker: TrackerDefinition): void {
    if (this.loaded.has(tracker.id)) return; // never twice
    assertGranted(this.granted, tracker); // never early

    const doc = this.doc;
    if (!doc && (tracker.src || tracker.code)) return; // SSR: retry on the client

    // Mark before running side effects so a throwing onGrant cannot cause a
    // second injection on the next consent event.
    this.loaded.add(tracker.id);

    try {
      if (tracker.src || tracker.code) {
        const script = (doc as Document).createElement('script');
        script.setAttribute(TRACKER_ATTR, tracker.id);
        script.setAttribute(CATEGORY_ATTR, tracker.category);
        script.type = tracker.type ?? 'text/javascript';
        for (const [name, value] of Object.entries(tracker.attributes ?? {})) {
          script.setAttribute(name, value);
        }
        if (tracker.src) {
          script.async = tracker.async ?? true;
          if (tracker.defer) script.defer = true;
          script.src = tracker.src;
        } else {
          script.text = tracker.code as string;
        }
        const parent =
          tracker.appendTo === 'body'
            ? ((doc as Document).body ?? (doc as Document).documentElement)
            : ((doc as Document).head ?? (doc as Document).documentElement);
        parent.appendChild(script);
        this.nodes.set(tracker.id, script);
      }

      if (tracker.onGrant) {
        const result = tracker.onGrant({ tracker, record: this.record });
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch((error) => this.reportError(error, tracker));
        }
      }
    } catch (error) {
      this.reportError(error, tracker);
    }
  }

  /** @returns `true` if the tracker had actually been loaded. */
  private unload(tracker: TrackerDefinition): boolean {
    if (!this.loaded.has(tracker.id)) return false;

    try {
      tracker.onRevoke?.();
    } catch (error) {
      this.reportError(error, tracker);
    }

    this.nodes.get(tracker.id)?.remove();
    this.nodes.delete(tracker.id);

    // Without a reload the script's globals are still in memory, but allowing a
    // later re-grant to re-inject is the correct behaviour for SPA teardown.
    this.loaded.delete(tracker.id);
    return true;
  }

  private reload(): void {
    if (this.options.reload) {
      this.options.reload();
      return;
    }
    if (typeof location !== 'undefined' && typeof location.reload === 'function') {
      location.reload();
    }
  }

  private reportError(error: unknown, tracker: TrackerDefinition): void {
    if (this.options.onError) {
      this.options.onError(error, tracker);
      return;
    }
    // eslint-disable-next-line no-console
    console.error(`[consent-gate] tracker "${tracker.id}" failed:`, error);
  }

  destroy(): void {
    for (const [, node] of this.nodes) node.remove();
    this.nodes.clear();
    this.loaded.clear();
    this.trackers.clear();
    this.granted.clear();
    this.granted.add('necessary');
    this.decided = false;
    this.record = null;
  }
}
