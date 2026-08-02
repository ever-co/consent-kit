import type { ConsentCategory, ConsentRecord, ConsentUiAdapter, ConsentUiContext } from './types.js';

/**
 * A headless consent UI for tests.
 *
 * It renders nothing and stores nothing. Drive it from your test:
 *
 * ```ts
 * const ui = createMemoryUi();
 * const consent = createConsent({ trackers, ui, reloadOnRevoke: false });
 * await consent.ready;
 * expect(document.querySelector('script[data-consent-tracker="ga"]')).toBeNull();
 * ui.grant(['analytics']);
 * expect(document.querySelector('script[data-consent-tracker="ga"]')).not.toBeNull();
 * ```
 */
export interface MemoryUi extends ConsentUiAdapter {
  /** Simulate the user granting exactly these categories. */
  grant(categories: ConsentCategory[]): void;
  /** Simulate restoring a stored consent on page load. */
  restore(categories: ConsentCategory[], record?: Partial<ConsentRecord>): void;
  /** Fire the consent callback again with the current state (duplicate-event test). */
  replay(): void;
  readonly bannerShown: number;
  readonly preferencesShown: number;
  readonly resets: number;
}

let seq = 0;

export function createMemoryUi(): MemoryUi {
  let context: ConsentUiContext | null = null;
  let granted: ConsentCategory[] = ['necessary'];
  let record: ConsentRecord | null = null;
  const counters = { bannerShown: 0, preferencesShown: 0, resets: 0 };

  const buildRecord = (
    categories: ConsentCategory[],
    overrides: Partial<ConsentRecord> = {},
  ): ConsentRecord => {
    const now = new Date().toISOString();
    return {
      id: record?.id ?? `memory-consent-${++seq}`,
      revision: context?.options.revision ?? 0,
      policyVersion: context?.options.policyVersion,
      categories,
      grantedAt: record?.grantedAt ?? now,
      updatedAt: now,
      languageCode: context?.options.language ?? 'en',
      ...overrides,
    };
  };

  const emit = (categories: ConsentCategory[], next: ConsentRecord | null) => {
    granted = categories.includes('necessary') ? categories : ['necessary', ...categories];
    record = next;
    context?.onConsent([...granted], record);
  };

  const ui: MemoryUi = {
    async mount(ctx) {
      context = ctx;
      // No stored consent: the engine is told explicitly that nothing is granted.
      ctx.onConsent(['necessary'], null);
    },
    showBanner() {
      counters.bannerShown += 1;
    },
    showPreferences() {
      counters.preferencesShown += 1;
    },
    setCategories(categories) {
      emit(categories, buildRecord(categories.includes('necessary') ? categories : ['necessary', ...categories]));
    },
    reset() {
      counters.resets += 1;
      record = null;
      emit(['necessary'], null);
    },
    destroy() {
      context = null;
      granted = ['necessary'];
      record = null;
    },
    grant(categories) {
      ui.setCategories(['necessary', ...categories.filter((c) => c !== 'necessary')]);
    },
    restore(categories, overrides) {
      const all = categories.includes('necessary') ? categories : (['necessary', ...categories] as ConsentCategory[]);
      emit(all, buildRecord(all, overrides));
    },
    replay() {
      context?.onConsent([...granted], record);
    },
    get bannerShown() {
      return counters.bannerShown;
    },
    get preferencesShown() {
      return counters.preferencesShown;
    },
    get resets() {
      return counters.resets;
    },
  };

  return ui;
}
