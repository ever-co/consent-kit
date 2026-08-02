import type {
  ConsentCategory,
  ConsentCopy,
  ConsentRecord,
  ConsentUiAdapter,
  ConsentUiContext,
} from './types.js';

type CookieConsentModule = typeof import('vanilla-cookieconsent');

interface CookieValueLike {
  categories?: string[];
  revision?: number;
  consentId?: string;
  consentTimestamp?: string;
  lastConsentTimestamp?: string;
  languageCode?: string;
}

const DEFAULT_COPY: Required<
  Pick<
    ConsentCopy,
    | 'bannerTitle'
    | 'bannerDescription'
    | 'acceptAll'
    | 'rejectAll'
    | 'managePreferences'
    | 'preferencesTitle'
    | 'preferencesDescription'
    | 'savePreferences'
    | 'close'
    | 'privacyPolicyLabel'
  >
> = {
  bannerTitle: 'We use cookies',
  bannerDescription:
    'We use strictly necessary cookies to make this site work. With your permission we would also like to use ' +
    'optional cookies for analytics, marketing and preferences. Nothing optional is set until you choose. ' +
    'You can change or withdraw your choice at any time.',
  acceptAll: 'Accept all',
  rejectAll: 'Reject all',
  managePreferences: 'Manage preferences',
  preferencesTitle: 'Cookie preferences',
  preferencesDescription:
    'Choose which optional cookies you allow. Strictly necessary cookies cannot be switched off because the site ' +
    'does not work without them. Your choice is stored with a timestamp and you can change it whenever you like.',
  savePreferences: 'Save my choices',
  close: 'Close',
  privacyPolicyLabel: 'Privacy policy',
};

const CATEGORY_COPY: Record<ConsentCategory, { title: string; description: string }> = {
  necessary: {
    title: 'Strictly necessary',
    description:
      'Required for the site to function — security, load balancing, and remembering your cookie choice. ' +
      'These are always on and cannot be disabled.',
  },
  analytics: {
    title: 'Analytics',
    description:
      'Help us understand how the site is used, so we can improve it. Off until you turn them on.',
  },
  marketing: {
    title: 'Marketing',
    description:
      'Used to measure advertising and to show you relevant messages on other sites. Off until you turn them on.',
  },
  preferences: {
    title: 'Preferences',
    description:
      'Remember choices you make — language, region, theme — so the site feels the same next visit. ' +
      'Off until you turn them on.',
  },
};

export function toConsentRecord(cookie: CookieValueLike | null | undefined, policyVersion?: string): ConsentRecord | null {
  if (!cookie || !cookie.consentId) return null;
  const categories = (cookie.categories ?? []).filter((c): c is ConsentCategory =>
    ['necessary', 'analytics', 'marketing', 'preferences'].includes(c),
  );
  if (!categories.includes('necessary')) categories.unshift('necessary');
  return {
    id: cookie.consentId,
    revision: cookie.revision ?? 0,
    policyVersion,
    categories,
    grantedAt: cookie.consentTimestamp ?? new Date().toISOString(),
    updatedAt: cookie.lastConsentTimestamp ?? cookie.consentTimestamp ?? new Date().toISOString(),
    languageCode: cookie.languageCode,
  };
}

/**
 * CookieConsent v3 (Orest Bida, MIT) adapter.
 *
 * The compliance-critical parts of the config are hard-coded here rather than
 * exposed: opt-in mode, no page-interaction block (no cookie wall), equal-weight
 * accept/reject at the first layer, every optional category off by default,
 * `manageScriptTags: false` so the CMP never injects anything itself.
 */
export class CookieConsentUi implements ConsentUiAdapter {
  private api: CookieConsentModule | null = null;
  private context: ConsentUiContext | null = null;
  private config: Record<string, unknown> | null = null;

  async mount(context: ConsentUiContext): Promise<void> {
    this.context = context;
    const options = context.options;

    if (typeof document === 'undefined') {
      // Server render: there is nothing to mount, and nothing may be granted.
      // The client bundle mounts for real. Fail closed rather than throwing, so
      // an `initConsent()` call in shared module scope cannot break SSR.
      context.onConsent(['necessary'], null);
      return;
    }

    const api = (await import('vanilla-cookieconsent')) as unknown as CookieConsentModule;
    this.api = api;

    const copy = { ...DEFAULT_COPY, ...(options.copy ?? {}) };
    const categoryCopy = { ...CATEGORY_COPY };
    for (const [key, value] of Object.entries(options.copy?.categories ?? {})) {
      categoryCopy[key as ConsentCategory] = { ...categoryCopy[key as ConsentCategory], ...value };
    }

    const language = options.language ?? 'en';
    const emit = (cookie: CookieValueLike | null | undefined) => {
      const record = toConsentRecord(cookie, options.policyVersion);
      const granted = (record?.categories ?? ['necessary']) as ConsentCategory[];
      context.onConsent(granted, record);
    };

    // Build the cookie block without undefined keys: CookieConsent merges this
    // over its own defaults, and an explicit `domain: undefined` would end up
    // written as `Domain=undefined` on any host containing a dot.
    const cookie: Record<string, unknown> = { name: options.cookie?.name ?? 'cg_consent' };
    if (options.cookie?.domain !== undefined) cookie.domain = options.cookie.domain;
    if (options.cookie?.path !== undefined) cookie.path = options.cookie.path;
    if (options.cookie?.sameSite !== undefined) cookie.sameSite = options.cookie.sameSite;
    if (options.cookie?.expiresAfterDays !== undefined) {
      cookie.expiresAfterDays = options.cookie.expiresAfterDays;
    }

    const config: Record<string, unknown> = {
      ...(options.cmp ?? {}),
      // --- compliance-locked, intentionally after the spread ---
      mode: 'opt-in',
      manageScriptTags: false,
      autoClearCookies: true,
      disablePageInteraction: false,
      hideFromBots: true,
      autoShow: options.autoShow ?? true,
      revision: options.revision ?? 0,
      cookie,
      guiOptions: {
        consentModal: { layout: 'box', position: 'bottom left', equalWeightButtons: true, flipButtons: false },
        preferencesModal: { layout: 'box', equalWeightButtons: true, flipButtons: false },
      },
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: { enabled: false, readOnly: false, autoClear: { cookies: [], reloadPage: false } },
        marketing: { enabled: false, readOnly: false, autoClear: { cookies: [], reloadPage: false } },
        preferences: { enabled: false, readOnly: false, autoClear: { cookies: [], reloadPage: false } },
      },
      language: {
        default: language,
        translations: {
          [language]: {
            consentModal: {
              title: copy.bannerTitle,
              description: copy.bannerDescription,
              // Reject is present at the FIRST layer, same weight as accept.
              acceptAllBtn: copy.acceptAll,
              acceptNecessaryBtn: copy.rejectAll,
              showPreferencesBtn: copy.managePreferences,
              closeIconLabel: '',
              footer: options.copy?.privacyPolicyHref
                ? `<a href="${options.copy.privacyPolicyHref}">${copy.privacyPolicyLabel}</a>`
                : undefined,
            },
            preferencesModal: {
              title: copy.preferencesTitle,
              acceptAllBtn: copy.acceptAll,
              acceptNecessaryBtn: copy.rejectAll,
              savePreferencesBtn: copy.savePreferences,
              closeIconLabel: copy.close,
              sections: [
                { description: copy.preferencesDescription },
                ...context.categories.map((category) => ({
                  title: categoryCopy[category].title,
                  description: categoryCopy[category].description,
                  linkedCategory: category,
                })),
              ],
            },
          },
        },
      },
      onFirstConsent: ({ cookie }: { cookie: CookieValueLike }) => emit(cookie),
      onConsent: ({ cookie }: { cookie: CookieValueLike }) => emit(cookie),
      onChange: ({ cookie }: { cookie: CookieValueLike }) => emit(cookie),
    };

    if (options.root != null) config.root = options.root;

    // Auto-clear the cookies each tracker declares, on withdrawal.
    const autoClear = config.categories as Record<string, { autoClear?: { cookies: unknown[] } }>;
    for (const tracker of options.trackers ?? []) {
      if (tracker.category === 'necessary' || !tracker.cookies?.length) continue;
      const bucket = autoClear[tracker.category]?.autoClear;
      if (bucket) bucket.cookies.push(...tracker.cookies.map((name) => ({ name })));
    }

    this.config = config;
    await api.run(config as never);

    // `onConsent` does not fire when there is no stored consent yet, so make the
    // "nothing granted" state explicit for the engine.
    if (!api.validConsent()) context.onConsent(['necessary'], null);
  }

  showBanner(): void {
    this.api?.show(true);
  }

  showPreferences(): void {
    this.api?.showPreferences();
  }

  setCategories(categories: ConsentCategory[]): void {
    // `acceptCategory([])` keeps only the read-only `necessary` category.
    this.api?.acceptCategory(categories.filter((c) => c !== 'necessary'));
  }

  reset(eraseCookie = true): void {
    const api = this.api;
    if (!api) return;

    api.reset(eraseCookie);
    this.context?.onConsent(['necessary'], null);

    // `reset()` tears the CMP down completely — DOM, listeners and all. Without
    // re-running it, withdrawing consent would leave the user with no way to
    // consent again, which breaks "withdrawal as easy as granting". With the
    // default `reloadOnRevoke` the reload gets there first and this is a no-op.
    if (this.config) void api.run(this.config as never);
  }

  eraseCookies(cookies: Array<string | RegExp>): void {
    if (cookies.length) this.api?.eraseCookies(cookies);
  }

  destroy(): void {
    this.api?.reset(false);
    this.api = null;
    this.context = null;
  }
}
