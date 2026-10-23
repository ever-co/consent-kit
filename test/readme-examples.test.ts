import { describe, expect, it } from 'vitest';
import { createConsent, defineTrackers } from '../src/core.js';
import { createMemoryUi } from '../src/testing.js';
import type { ConsentOptions } from '../src/types.js';

/**
 * The declarations copy-pasted from README.md / examples/. This file exists so
 * `tsc --noEmit` fails the build if the documented shapes ever stop compiling —
 * a README that does not type-check is worse than no README.
 */

const GA_ID = 'G-XXXXXXXXXX';
const POSTHOG_KEY = 'phc_test';

const trackers = defineTrackers([
  {
    id: 'google-analytics',
    category: 'analytics',
    src: `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`,
    cookies: [/^_ga/, '_gid'],
  },
  {
    id: 'google-analytics-config',
    category: 'analytics',
    code: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments)}
      gtag('js', new Date());
      gtag('config', '${GA_ID}', { anonymize_ip: true });
    `,
  },
  {
    id: 'posthog',
    category: 'analytics',
    onGrant: async () => {
      void POSTHOG_KEY;
    },
    onRevoke: () => {},
    cookies: [/^ph_/],
  },
  {
    id: 'linkedin-insight',
    category: 'marketing',
    src: 'https://snap.licdn.com/li.lms-analytics/insight.min.js',
    cookies: [/^li_/, 'bcookie', 'lidc'],
  },
  {
    id: 'recaptcha',
    category: 'necessary',
    src: 'https://www.google.com/recaptcha/api.js',
    async: true,
    defer: true,
    attributes: { 'data-purpose': 'anti-fraud' },
  },
]);

const options: ConsentOptions = {
  trackers: [...trackers],
  policyVersion: '2026-08-01',
  revision: 0,
  copy: { privacyPolicyHref: '/privacy' },
  legacyEvents: { names: ['iubenda_consent_given'], categories: ['analytics'] },
  cookie: { name: 'cg_consent', sameSite: 'Lax', expiresAfterDays: 182 },
  onChange: (record, granted) => {
    void record;
    void granted;
  },
};

describe('the documented example', () => {
  it('compiles and behaves as the README claims', async () => {
    document.head.innerHTML = '';
    const ui = createMemoryUi();
    const consent = createConsent({ ...options, ui, reloadOnRevoke: false });
    await consent.ready;

    // The necessary-category reCAPTCHA loads straight away; nothing else does.
    expect(consent.hasLoaded('recaptcha')).toBe(true);
    expect(consent.hasLoaded('google-analytics')).toBe(false);
    expect(consent.hasLoaded('linkedin-insight')).toBe(false);
    expect(document.querySelectorAll('script[data-consent-tracker]')).toHaveLength(1);

    const recaptcha = document.querySelector<HTMLScriptElement>('script[data-consent-tracker="recaptcha"]');
    expect(recaptcha?.getAttribute('data-purpose')).toBe('anti-fraud');
    expect(recaptcha?.defer).toBe(true);

    ui.grant(['analytics']);
    expect(consent.hasLoaded('google-analytics')).toBe(true);
    expect(consent.hasLoaded('google-analytics-config')).toBe(true);
    expect(consent.hasLoaded('posthog')).toBe(true);
    expect(consent.hasLoaded('linkedin-insight')).toBe(false);

    consent.destroy();
  });
});
