import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createConsent } from '../src/core.js';
import { IUBENDA_CONSENT_EVENT } from '../src/legacy.js';
import { createMemoryUi } from '../src/testing.js';
import type { LegacyEventDetail } from '../src/legacy.js';

/**
 * gauzy.co gates its analytics on a hand-rolled listener for Iubenda's
 * `iubenda_consent_given`. It is the one site in the fleet where gating actually
 * works. Replacing Iubenda must not silently remove that gate, so the bridge is
 * on by default and these tests pin its behaviour.
 */
describe('iubenda_consent_given bridge', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
  });

  it('is on by default and fires for both document and window listeners, once each', async () => {
    const onDocument = vi.fn();
    const onWindow = vi.fn();
    document.addEventListener(IUBENDA_CONSENT_EVENT, onDocument);
    window.addEventListener(IUBENDA_CONSENT_EVENT, onWindow);

    const ui = createMemoryUi();
    const consent = createConsent({ ui, reloadOnRevoke: false });
    await consent.ready;

    expect(onDocument).not.toHaveBeenCalled();
    expect(onWindow).not.toHaveBeenCalled();

    ui.grant(['analytics']);

    expect(onDocument).toHaveBeenCalledTimes(1);
    expect(onWindow).toHaveBeenCalledTimes(1);

    document.removeEventListener(IUBENDA_CONSENT_EVENT, onDocument);
    window.removeEventListener(IUBENDA_CONSENT_EVENT, onWindow);
    consent.destroy();
  });

  it('carries a usable detail payload', async () => {
    let detail: LegacyEventDetail | undefined;
    const listener = (event: Event) => {
      detail = (event as CustomEvent<LegacyEventDetail>).detail;
    };
    document.addEventListener(IUBENDA_CONSENT_EVENT, listener);

    const ui = createMemoryUi();
    const consent = createConsent({ ui, reloadOnRevoke: false, policyVersion: '2026-08-01' });
    await consent.ready;
    ui.grant(['analytics', 'marketing']);

    expect(detail?.source).toBe('consent-gate');
    expect(detail?.consent).toBe(true);
    expect(detail?.categories).toEqual(expect.arrayContaining(['necessary', 'analytics', 'marketing']));
    expect(detail?.record?.policyVersion).toBe('2026-08-01');

    document.removeEventListener(IUBENDA_CONSENT_EVENT, listener);
    consent.destroy();
  });

  it('does NOT fire on reject-all', async () => {
    const listener = vi.fn();
    document.addEventListener(IUBENDA_CONSENT_EVENT, listener);

    const ui = createMemoryUi();
    const consent = createConsent({ ui, reloadOnRevoke: false });
    await consent.ready;
    consent.rejectAll();

    expect(listener).not.toHaveBeenCalled();
    document.removeEventListener(IUBENDA_CONSENT_EVENT, listener);
    consent.destroy();
  });

  it('does NOT fire for a preferences-only grant', async () => {
    const listener = vi.fn();
    document.addEventListener(IUBENDA_CONSENT_EVENT, listener);

    const ui = createMemoryUi();
    const consent = createConsent({ ui, reloadOnRevoke: false });
    await consent.ready;
    ui.grant(['preferences']);

    expect(listener).not.toHaveBeenCalled();
    document.removeEventListener(IUBENDA_CONSENT_EVENT, listener);
    consent.destroy();
  });

  it('fires again after a withdraw + re-grant cycle, but not on repeat events', async () => {
    const listener = vi.fn();
    document.addEventListener(IUBENDA_CONSENT_EVENT, listener);

    const ui = createMemoryUi();
    const consent = createConsent({ ui, reloadOnRevoke: false });
    await consent.ready;

    ui.grant(['analytics']);
    ui.replay();
    ui.replay();
    expect(listener).toHaveBeenCalledTimes(1);

    ui.grant([]);
    expect(listener).toHaveBeenCalledTimes(1);

    ui.grant(['analytics']);
    expect(listener).toHaveBeenCalledTimes(2);

    document.removeEventListener(IUBENDA_CONSENT_EVENT, listener);
    consent.destroy();
  });

  it('supports extra legacy event names', async () => {
    const listener = vi.fn();
    document.addEventListener('legacy_cmp_ready', listener);

    const ui = createMemoryUi();
    const consent = createConsent({
      ui,
      reloadOnRevoke: false,
      legacyEvents: { names: [IUBENDA_CONSENT_EVENT, 'legacy_cmp_ready'] },
    });
    await consent.ready;
    ui.grant(['analytics']);

    expect(listener).toHaveBeenCalledTimes(1);
    document.removeEventListener('legacy_cmp_ready', listener);
    consent.destroy();
  });

  it('can be switched off', async () => {
    const listener = vi.fn();
    document.addEventListener(IUBENDA_CONSENT_EVENT, listener);

    const ui = createMemoryUi();
    const consent = createConsent({ ui, reloadOnRevoke: false, legacyEvents: false });
    await consent.ready;
    ui.grant(['analytics']);

    expect(listener).not.toHaveBeenCalled();
    document.removeEventListener(IUBENDA_CONSENT_EVENT, listener);
    consent.destroy();
  });
});
