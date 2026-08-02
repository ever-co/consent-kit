import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConsent } from '../src/core.js';
import { IUBENDA_CONSENT_EVENT } from '../src/legacy.js';
import type { ConsentInstance } from '../src/types.js';

/**
 * End-to-end against the real CookieConsent v3 UI in jsdom: no fake adapter,
 * no direct engine calls — the banner is rendered and its buttons are clicked.
 */

const GA = {
  id: 'google-analytics',
  category: 'analytics' as const,
  src: 'https://www.googletagmanager.com/gtag/js?id=G-INTEGRATION',
};

const ADS = {
  id: 'linkedin-insight',
  category: 'marketing' as const,
  src: 'https://snap.licdn.com/li.lms-analytics/insight.min.js',
};

function trackerScripts(id?: string): Element[] {
  const selector = id ? `script[data-consent-tracker="${id}"]` : 'script[data-consent-tracker]';
  return [...document.querySelectorAll(selector)];
}

function clickByRole(role: string): void {
  const button = document.querySelector<HTMLButtonElement>(`#cc-main [data-role="${role}"]`);
  if (!button) throw new Error(`No consent button with data-role="${role}" in the DOM.`);
  button.click();
}

async function boot(extra: Record<string, unknown> = {}): Promise<ConsentInstance> {
  const consent = createConsent({
    trackers: [GA, ADS],
    reloadOnRevoke: false,
    policyVersion: '2026-08-01',
    ...extra,
  });
  await consent.ready;
  return consent;
}

let instance: ConsentInstance | null = null;

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.className = '';
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:01 GMT; path=/`;
  }
  (window as unknown as { _ccRun?: boolean })._ccRun = false;
});

afterEach(() => {
  instance?.destroy();
  instance = null;
});

describe('CookieConsent v3 integration', () => {
  it('renders a first-layer notice with reject as prominent as accept, and injects nothing', async () => {
    instance = await boot();

    const modal = document.querySelector('#cc-main .cm');
    expect(modal).not.toBeNull();

    const acceptAll = document.querySelector<HTMLElement>('#cc-main [data-role="all"]');
    const rejectAll = document.querySelector<HTMLElement>('#cc-main [data-role="necessary"]');
    const managePrefs = document.querySelector<HTMLElement>('#cc-main [data-role="show"]');

    // Reject is present at the FIRST layer, next to accept — not buried in a submenu.
    expect(acceptAll).not.toBeNull();
    expect(rejectAll).not.toBeNull();
    expect(managePrefs).not.toBeNull();
    // equalWeightButtons: neither accept nor reject is demoted to the secondary style.
    expect(acceptAll?.classList.contains('cm__btn--secondary')).toBe(false);
    expect(rejectAll?.classList.contains('cm__btn--secondary')).toBe(false);

    // No cookie wall.
    expect(document.documentElement.classList.contains('disable--interaction')).toBe(false);

    // The whole point:
    expect(trackerScripts()).toHaveLength(0);
    expect(instance.hasLoaded('google-analytics')).toBe(false);
    expect(instance.getRecord()).toBeNull();
  });

  it('has no pre-ticked optional categories in the preference centre', async () => {
    instance = await boot();
    instance.showPreferences();

    const toggles = [...document.querySelectorAll<HTMLInputElement>('#cc-main .pm input.section__toggle')];
    expect(toggles.length).toBeGreaterThanOrEqual(4);

    const byValue = Object.fromEntries(toggles.map((t) => [t.value, t]));
    expect(byValue.necessary?.checked).toBe(true);
    expect(byValue.necessary?.disabled).toBe(true);
    expect(byValue.analytics?.checked).toBe(false);
    expect(byValue.marketing?.checked).toBe(false);
    expect(byValue.preferences?.checked).toBe(false);
    expect(trackerScripts()).toHaveLength(0);
  });

  it('injects nothing when the user clicks Reject all', async () => {
    instance = await boot();
    clickByRole('necessary');

    expect(trackerScripts()).toHaveLength(0);
    expect(instance.isGranted('analytics')).toBe(false);
    expect(instance.getRecord()?.categories).toEqual(['necessary']);
  });

  it('injects every tracker exactly once when the user clicks Accept all', async () => {
    instance = await boot();
    clickByRole('all');

    expect(trackerScripts('google-analytics')).toHaveLength(1);
    expect(trackerScripts('linkedin-insight')).toHaveLength(1);
    expect(trackerScripts()).toHaveLength(2);
    expect(instance.hasLoaded('google-analytics')).toBe(true);

    // CookieConsent fires onFirstConsent AND onConsent AND onChange for the same
    // action — a naive implementation would inject three copies.
    expect(trackerScripts()).toHaveLength(2);
  });

  it('honours a per-category choice made in the preference centre', async () => {
    instance = await boot();
    instance.showPreferences();

    const analytics = document.querySelector<HTMLInputElement>('#cc-main input.section__toggle[value="analytics"]');
    expect(analytics).not.toBeNull();
    analytics!.click();

    const save = document.querySelector<HTMLButtonElement>('#cc-main [data-role="save"]');
    expect(save).not.toBeNull();
    save!.click();

    expect(trackerScripts('google-analytics')).toHaveLength(1);
    expect(trackerScripts('linkedin-insight')).toHaveLength(0);
    expect(instance.isGranted('analytics')).toBe(true);
    expect(instance.isGranted('marketing')).toBe(false);
  });

  it('stores an auditable consent record and re-emits iubenda_consent_given', async () => {
    const seen: unknown[] = [];
    const listener = (event: Event) => seen.push((event as CustomEvent).detail);
    document.addEventListener(IUBENDA_CONSENT_EVENT, listener);

    instance = await boot();
    expect(seen).toHaveLength(0);

    clickByRole('all');

    const record = instance.getRecord();
    expect(record).not.toBeNull();
    expect(record?.id).toMatch(/[0-9a-f-]{36}/i);
    expect(record?.policyVersion).toBe('2026-08-01');
    expect(record?.revision).toBe(0);
    expect(record?.categories).toEqual(
      expect.arrayContaining(['necessary', 'analytics', 'marketing', 'preferences']),
    );
    expect(Date.parse(record!.grantedAt)).not.toBeNaN();
    expect(Date.parse(record!.updatedAt)).not.toBeNaN();

    // The record is persisted first-party, so it survives a reload.
    expect(document.cookie).toContain('cg_consent=');

    expect(seen).toHaveLength(1);
    document.removeEventListener(IUBENDA_CONSENT_EVENT, listener);
  });

  it('exposes a preference-centre entry point that works after the banner is gone', async () => {
    instance = await boot();
    clickByRole('all');

    instance.showPreferences();
    const prefs = document.querySelector('#cc-main .pm');
    expect(prefs).not.toBeNull();
    expect(prefs?.getAttribute('aria-hidden')).toBe('false');
  });

  it('reset() clears the record and brings the first layer back', async () => {
    instance = await boot();
    clickByRole('all');
    expect(trackerScripts()).toHaveLength(2);

    instance.reset();

    expect(instance.getRecord()).toBeNull();
    expect(instance.isGranted('analytics')).toBe(false);
    expect(trackerScripts()).toHaveLength(0);

    // The notice is re-mounted asynchronously (CookieConsent's run() is async).
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Withdrawal must not leave the user without a way to consent again.
    expect(document.querySelector('#cc-main [data-role="all"]')).not.toBeNull();
    expect(document.querySelector('#cc-main [data-role="necessary"]')).not.toBeNull();
  });

  it('withdrawal is available and takes effect', async () => {
    instance = await boot();
    clickByRole('all');
    expect(trackerScripts()).toHaveLength(2);

    instance.showPreferences();
    clickByRole('necessary');

    expect(instance.isGranted('analytics')).toBe(false);
    expect(instance.isGranted('marketing')).toBe(false);
    expect(trackerScripts()).toHaveLength(0);
  });
});
