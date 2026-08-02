// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createConsent } from '../src/core.js';
import { CookieConsentUi } from '../src/ui-cookieconsent.js';

/**
 * Running in the `node` environment: there is no `document`, exactly like a
 * Next.js server render. Importing and calling the library must not blow up,
 * and must not grant anything.
 */
describe('server-side rendering', () => {
  it('mounts as a no-op with nothing granted instead of throwing', async () => {
    expect(typeof document).toBe('undefined');

    const consent = createConsent({
      ui: new CookieConsentUi(),
      trackers: [
        {
          id: 'google-analytics',
          category: 'analytics',
          src: 'https://www.googletagmanager.com/gtag/js?id=G-SSR',
        },
      ],
    });

    await expect(consent.ready).resolves.toBeUndefined();
    expect(consent.isGranted('analytics')).toBe(false);
    expect(consent.hasLoaded('google-analytics')).toBe(false);
    expect(consent.getRecord()).toBeNull();
    consent.destroy();
  });

  it('still validates declarations on the server', () => {
    expect(() =>
      createConsent({
        ui: new CookieConsentUi(),
        trackers: [
          { id: 'gtm', category: 'necessary', src: 'https://www.googletagmanager.com/gtm.js?id=GTM-X' },
        ],
      }),
    ).toThrow(/never strictly necessary/i);
  });
});
