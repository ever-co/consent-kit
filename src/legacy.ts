import { GATED_CATEGORIES, type ConsentCategory, type ConsentRecord, type GatedCategory, type LegacyEventOptions } from './types.js';

/**
 * Iubenda dispatches this event on `document` when the user gives consent.
 * At least one site in the fleet gates its analytics on a hand-rolled listener
 * for it, so removing Iubenda must not remove that working gate.
 */
export const IUBENDA_CONSENT_EVENT = 'iubenda_consent_given';

export const DEFAULT_LEGACY_EVENT_NAMES = [IUBENDA_CONSENT_EVENT];
export const DEFAULT_LEGACY_EVENT_CATEGORIES: GatedCategory[] = ['analytics', 'marketing'];

export interface LegacyEventDetail {
  source: 'consent-gate';
  categories: ConsentCategory[];
  record: ConsentRecord | null;
  /** Mirrors Iubenda's shape closely enough for the common `detail.consent` check. */
  consent: true;
}

export interface LegacyBridgeOptions extends LegacyEventOptions {
  document?: Document;
}

/**
 * Re-emits the legacy consent events exactly once per grant transition.
 *
 * Dispatched on `document` with `bubbles: true`, so both
 * `document.addEventListener(...)` and `window.addEventListener(...)` listeners
 * fire, and each fires only once.
 */
export class LegacyEventBridge {
  private readonly names: string[];
  private readonly categories: GatedCategory[];
  private readonly doc?: Document;
  private emitted = false;

  constructor(options: LegacyBridgeOptions = {}) {
    this.names = options.names ?? DEFAULT_LEGACY_EVENT_NAMES;
    this.categories = options.categories ?? DEFAULT_LEGACY_EVENT_CATEGORIES;
    this.doc = options.document;
  }

  /** Call on every consent change. Emits only on the first qualifying grant. */
  notify(granted: ConsentCategory[], record: ConsentRecord | null): string[] {
    const qualifies = this.categories.some((category) => granted.includes(category));
    if (!qualifies) {
      // A withdrawal re-arms the bridge, so a later re-grant fires again.
      this.emitted = false;
      return [];
    }
    if (this.emitted) return [];

    const doc = this.doc ?? (typeof document !== 'undefined' ? document : undefined);
    if (!doc) return [];

    const detail: LegacyEventDetail = {
      source: 'consent-gate',
      categories: [...granted],
      record,
      consent: true,
    };

    const dispatched: string[] = [];
    for (const name of this.names) {
      const event =
        typeof CustomEvent === 'function'
          ? new CustomEvent(name, { detail, bubbles: true, cancelable: false })
          : (() => {
              const legacy = doc.createEvent('CustomEvent');
              legacy.initCustomEvent(name, true, false, detail);
              return legacy;
            })();
      doc.dispatchEvent(event);
      dispatched.push(name);
    }
    this.emitted = true;
    return dispatched;
  }

  reset(): void {
    this.emitted = false;
  }
}

export function normalizeLegacyCategories(categories?: GatedCategory[]): GatedCategory[] {
  if (!categories) return DEFAULT_LEGACY_EVENT_CATEGORIES;
  return categories.filter((category) => GATED_CATEGORIES.includes(category));
}
