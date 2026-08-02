import { describe, expect, it } from 'vitest';
import { createConsent } from '../src/core.js';
import { assertCompliantOptions, assertValidTracker, ConsentConfigError, looksLikeKnownTracker } from '../src/guards.js';
import { createMemoryUi } from '../src/testing.js';

describe('you cannot smuggle a tracker into "necessary"', () => {
  const smuggled = [
    { id: 'ga', category: 'necessary' as const, src: 'https://www.google-analytics.com/analytics.js' },
    { id: 'gtm', category: 'necessary' as const, src: 'https://www.googletagmanager.com/gtm.js?id=GTM-XYZ' },
    { id: 'gtag', category: 'necessary' as const, src: 'https://www.googletagmanager.com/gtag/js?id=G-1' },
    { id: 'meta', category: 'necessary' as const, src: 'https://connect.facebook.net/en_US/fbevents.js' },
    { id: 'posthog', category: 'necessary' as const, src: 'https://eu.i.posthog.com/static/array.js' },
    { id: 'hotjar', category: 'necessary' as const, src: 'https://static.hotjar.com/c/hotjar-1.js' },
    { id: 'clarity', category: 'necessary' as const, src: 'https://www.clarity.ms/tag/abc' },
    { id: 'inline-gtag', category: 'necessary' as const, code: "gtag('config','G-1')" },
    { id: 'inline-dl', category: 'necessary' as const, code: 'window.dataLayer.push({event:"x"})' },
    { id: 'inline-fbq', category: 'necessary' as const, code: "fbq('init','1')" },
  ];

  for (const tracker of smuggled) {
    it(`rejects ${tracker.id}`, () => {
      expect(() => assertValidTracker(tracker)).toThrow(ConsentConfigError);
      expect(() => assertValidTracker(tracker)).toThrow(/never strictly necessary/i);
    });
  }

  it('accepts the same trackers under analytics/marketing', () => {
    for (const tracker of smuggled) {
      expect(() => assertValidTracker({ ...tracker, category: 'analytics' })).not.toThrow();
    }
  });

  it('allows a genuinely necessary first-party script', () => {
    expect(() =>
      assertValidTracker({ id: 'csrf', category: 'necessary', src: 'https://example.com/csrf.js' }),
    ).not.toThrow();
  });

  it('allows reCAPTCHA under necessary — anti-fraud is a defensible essential use', () => {
    expect(() =>
      assertValidTracker({
        id: 'recaptcha',
        category: 'necessary',
        src: 'https://www.google.com/recaptcha/api.js',
      }),
    ).not.toThrow();
  });

  it('detects known trackers by host and by inline signature', () => {
    expect(looksLikeKnownTracker({ id: 'a', category: 'analytics', src: 'https://cdn.mxpnl.com/x.js' })).toBe(
      'cdn.mxpnl.com',
    );
    expect(looksLikeKnownTracker({ id: 'b', category: 'analytics', src: 'https://mixpanel.com/x.js' })).toBe(
      'mixpanel.com',
    );
    expect(looksLikeKnownTracker({ id: 'c', category: 'analytics', code: '_paq.push(["trackPageView"])' })).toContain(
      'inline code',
    );
    expect(
      looksLikeKnownTracker({ id: 'd', category: 'necessary', src: 'https://cdn.example.com/csrf.js' }),
    ).toBeNull();
  });
});

describe('tracker declarations are validated, not warned about', () => {
  it('rejects a missing id', () => {
    expect(() => assertValidTracker({ id: '', category: 'analytics', src: 'https://x/y.js' })).toThrow(
      ConsentConfigError,
    );
  });
  it('rejects an unknown category', () => {
    expect(() =>
      assertValidTracker({ id: 'x', category: 'statistics' as never, src: 'https://x/y.js' }),
    ).toThrow(/Valid categories/);
  });
  it('rejects a declaration that does nothing', () => {
    expect(() => assertValidTracker({ id: 'x', category: 'analytics' })).toThrow(/declares nothing to do/);
  });
  it('rejects src + code together', () => {
    expect(() =>
      assertValidTracker({ id: 'x', category: 'analytics', src: 'https://x/y.js', code: 'void 0' }),
    ).toThrow(/Pick one/);
  });
  it('rejects a javascript: src', () => {
    expect(() => assertValidTracker({ id: 'x', category: 'analytics', src: 'javascript:alert(1)' })).toThrow();
  });
});

describe('structurally non-compliant configuration is refused', () => {
  it('refuses a cookie wall', () => {
    expect(() => assertCompliantOptions({ cmp: { disablePageInteraction: true } })).toThrow(/cookie wall/i);
  });
  it('refuses opt-out mode', () => {
    expect(() => assertCompliantOptions({ cmp: { mode: 'opt-out' } })).toThrow(/opt-in only/i);
  });
  it('refuses CMP-managed script tags, which would bypass the gate', () => {
    expect(() => assertCompliantOptions({ cmp: { manageScriptTags: true } })).toThrow(/bypasses consent-gate/i);
  });
  it('refuses category overrides (no pre-ticked boxes)', () => {
    expect(() =>
      assertCompliantOptions({ cmp: { categories: { analytics: { enabled: true } } } }),
    ).toThrow(/cannot be overridden/i);
  });
  it('refuses unequal accept/reject buttons', () => {
    expect(() =>
      assertCompliantOptions({ cmp: { guiOptions: { consentModal: { equalWeightButtons: false } } } }),
    ).toThrow(/equalWeightButtons/);
  });
  it('refuses disabling auto-clear of cookies on withdrawal', () => {
    expect(() => assertCompliantOptions({ cmp: { autoClearCookies: false } })).toThrow(/cookies behind/i);
  });
  it('accepts a plain config', () => {
    expect(() => assertCompliantOptions({ trackers: [], policyVersion: '2026-08-01' })).not.toThrow();
  });
  it('createConsent() applies the same checks at construction time', () => {
    expect(() => createConsent({ ui: createMemoryUi(), cmp: { disablePageInteraction: true } })).toThrow(
      ConsentConfigError,
    );
  });
});
