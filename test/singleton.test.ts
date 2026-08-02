import { afterEach, describe, expect, it } from 'vitest';
import { getConsent, initConsent } from '../src/core.js';
import { createMemoryUi } from '../src/testing.js';

const GA = {
  id: 'google-analytics',
  category: 'analytics' as const,
  src: 'https://www.googletagmanager.com/gtag/js?id=G-SINGLE',
};

afterEach(() => {
  getConsent()?.destroy();
  document.head.innerHTML = '';
});

describe('the page-wide instance', () => {
  it('is created once, however many times initConsent is called', async () => {
    const first = initConsent({ ui: createMemoryUi(), reloadOnRevoke: false });
    const second = initConsent({ ui: createMemoryUi(), reloadOnRevoke: false });
    expect(second).toBe(first);
    expect(getConsent()).toBe(first);
    await first.ready;
  });

  it('is shared through globalThis so duplicate module copies cannot double-mount', async () => {
    const instance = initConsent({ ui: createMemoryUi(), reloadOnRevoke: false });
    await instance.ready;
    expect((globalThis as Record<symbol, unknown>)[Symbol.for('consent-gate.instance')]).toBe(instance);
  });

  it('merges trackers from later init calls without re-mounting the notice', async () => {
    const ui = createMemoryUi();
    const instance = initConsent({ ui, reloadOnRevoke: false });
    await instance.ready;

    initConsent({ trackers: [GA] });
    expect(document.querySelectorAll('script[data-consent-tracker]')).toHaveLength(0);

    ui.grant(['analytics']);
    expect(document.querySelectorAll('script[data-consent-tracker="google-analytics"]')).toHaveLength(1);
  });

  it('is cleared on destroy', async () => {
    const instance = initConsent({ ui: createMemoryUi(), reloadOnRevoke: false });
    await instance.ready;
    instance.destroy();
    expect(getConsent()).toBeNull();
  });
});
