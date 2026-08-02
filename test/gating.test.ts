import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConsent } from '../src/core.js';
import { ConsentEngine } from '../src/engine.js';
import { ConsentViolationError } from '../src/guards.js';
import { createMemoryUi, type MemoryUi } from '../src/testing.js';
import type { ConsentInstance, TrackerDefinition } from '../src/types.js';

const GA: TrackerDefinition = {
  id: 'google-analytics',
  category: 'analytics',
  src: 'https://www.googletagmanager.com/gtag/js?id=G-TEST',
};

const META_PIXEL: TrackerDefinition = {
  id: 'meta-pixel',
  category: 'marketing',
  src: 'https://connect.facebook.net/en_US/fbevents.js',
};

function scripts(id?: string): Element[] {
  const selector = id ? `script[data-consent-tracker="${id}"]` : 'script[data-consent-tracker]';
  return [...document.querySelectorAll(selector)];
}

describe('the gate: a declared tracker cannot load before consent', () => {
  let ui: MemoryUi;
  let consent: ConsentInstance;

  beforeEach(async () => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    ui = createMemoryUi();
    consent = createConsent({ trackers: [GA, META_PIXEL], ui, reloadOnRevoke: false });
    await consent.ready;
  });

  afterEach(() => {
    consent.destroy();
  });

  it('injects nothing at all before the user chooses', () => {
    expect(scripts()).toHaveLength(0);
    expect(consent.hasLoaded('google-analytics')).toBe(false);
    expect(consent.hasLoaded('meta-pixel')).toBe(false);
    expect(consent.isGranted('analytics')).toBe(false);
    expect(consent.isGranted('marketing')).toBe(false);
    expect(consent.isGranted('necessary')).toBe(true);
  });

  it('still injects nothing after a reject-all', () => {
    consent.rejectAll();
    expect(scripts()).toHaveLength(0);
    expect(consent.hasLoaded('google-analytics')).toBe(false);
  });

  it('injects only the granted category', () => {
    ui.grant(['analytics']);

    expect(scripts('google-analytics')).toHaveLength(1);
    expect(scripts('meta-pixel')).toHaveLength(0);
    expect(consent.hasLoaded('google-analytics')).toBe(true);
    expect(consent.hasLoaded('meta-pixel')).toBe(false);

    const node = scripts('google-analytics')[0] as HTMLScriptElement;
    expect(node.src).toBe('https://www.googletagmanager.com/gtag/js?id=G-TEST');
    expect(node.getAttribute('data-consent-category')).toBe('analytics');
    expect(node.async).toBe(true);
  });

  it('injects everything after accept-all', () => {
    consent.acceptAll();
    expect(scripts()).toHaveLength(2);
    expect(consent.hasLoaded('google-analytics')).toBe(true);
    expect(consent.hasLoaded('meta-pixel')).toBe(true);
  });

  it('never injects the same tracker twice, however many consent events arrive', () => {
    ui.grant(['analytics']);
    ui.grant(['analytics']);
    ui.replay();
    ui.replay();
    ui.grant(['analytics', 'marketing']);
    ui.replay();

    expect(scripts('google-analytics')).toHaveLength(1);
    expect(scripts('meta-pixel')).toHaveLength(1);
    expect(scripts()).toHaveLength(2);
  });

  it('runs an onGrant side effect exactly once, and never before consent', () => {
    const onGrant = vi.fn();
    consent.registerTracker({ id: 'posthog-init', category: 'analytics', onGrant });

    expect(onGrant).not.toHaveBeenCalled();

    ui.grant(['analytics']);
    expect(onGrant).toHaveBeenCalledTimes(1);

    ui.replay();
    ui.grant(['analytics', 'marketing']);
    expect(onGrant).toHaveBeenCalledTimes(1);
  });

  it('exposes the consent record once a choice is made', () => {
    expect(consent.getRecord()).toBeNull();
    ui.grant(['analytics']);

    const record = consent.getRecord();
    expect(record).not.toBeNull();
    expect(record?.categories).toEqual(expect.arrayContaining(['necessary', 'analytics']));
    expect(record?.categories).not.toContain('marketing');
    expect(Date.parse(record!.grantedAt)).not.toBeNaN();
    expect(Date.parse(record!.updatedAt)).not.toBeNaN();
    expect(typeof record!.id).toBe('string');
    expect(record!.revision).toBe(0);
  });
});

describe('late registration', () => {
  it('does not inject a tracker registered before consent', async () => {
    document.head.innerHTML = '';
    const ui = createMemoryUi();
    const consent = createConsent({ ui, reloadOnRevoke: false });
    await consent.ready;

    consent.registerTracker(GA);
    expect(scripts('google-analytics')).toHaveLength(0);

    ui.grant(['analytics']);
    expect(scripts('google-analytics')).toHaveLength(1);
    consent.destroy();
  });

  it('injects immediately when the category was already granted', async () => {
    document.head.innerHTML = '';
    const ui = createMemoryUi();
    const consent = createConsent({ ui, reloadOnRevoke: false });
    await consent.ready;

    ui.grant(['analytics']);
    expect(scripts()).toHaveLength(0);

    consent.registerTracker(GA);
    expect(scripts('google-analytics')).toHaveLength(1);
    consent.destroy();
  });
});

describe('restoring a stored choice on page load', () => {
  it('applies the stored categories without showing anything new', async () => {
    document.head.innerHTML = '';
    const ui = createMemoryUi();
    const consent = createConsent({ trackers: [GA, META_PIXEL], ui, reloadOnRevoke: false });
    await consent.ready;

    ui.restore(['analytics'], { id: 'stored-id', grantedAt: '2026-01-01T00:00:00.000Z' });

    expect(scripts('google-analytics')).toHaveLength(1);
    expect(scripts('meta-pixel')).toHaveLength(0);
    expect(consent.getRecord()?.id).toBe('stored-id');
    expect(consent.getRecord()?.grantedAt).toBe('2026-01-01T00:00:00.000Z');
    consent.destroy();
  });
});

describe('withdrawal', () => {
  it('removes the injected node, runs onRevoke, and reloads by default', async () => {
    document.head.innerHTML = '';
    const onRevoke = vi.fn();
    const reload = vi.fn();
    const engine = new ConsentEngine({ reload });
    engine.register({ ...GA, onRevoke });

    engine.applyConsent(['analytics'], null);
    expect(scripts('google-analytics')).toHaveLength(1);
    expect(reload).not.toHaveBeenCalled();

    engine.applyConsent([], null);
    expect(onRevoke).toHaveBeenCalledTimes(1);
    expect(scripts('google-analytics')).toHaveLength(0);
    expect(engine.hasLoaded('google-analytics')).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when nothing had been loaded', () => {
    const reload = vi.fn();
    const engine = new ConsentEngine({ reload });
    engine.register(GA);
    engine.applyConsent([], null);
    expect(reload).not.toHaveBeenCalled();
  });

  it('re-injects after a re-grant when reloadOnRevoke is off', () => {
    document.head.innerHTML = '';
    const engine = new ConsentEngine({ reloadOnRevoke: false });
    engine.register(GA);

    engine.applyConsent(['analytics'], null);
    expect(scripts('google-analytics')).toHaveLength(1);

    engine.applyConsent([], null);
    expect(scripts('google-analytics')).toHaveLength(0);

    engine.applyConsent(['analytics'], null);
    expect(scripts('google-analytics')).toHaveLength(1);
  });

  it('reset() clears the record and blocks trackers again', async () => {
    document.head.innerHTML = '';
    const ui = createMemoryUi();
    const consent = createConsent({ trackers: [GA], ui, reloadOnRevoke: false });
    await consent.ready;

    ui.grant(['analytics']);
    expect(consent.hasLoaded('google-analytics')).toBe(true);

    consent.reset();
    expect(consent.getRecord()).toBeNull();
    expect(consent.isGranted('analytics')).toBe(false);
    expect(scripts('google-analytics')).toHaveLength(0);
    consent.destroy();
  });
});

describe('last line of defence', () => {
  it('the engine refuses to inject an ungranted tracker even if forced', () => {
    const engine = new ConsentEngine({ reloadOnRevoke: false });
    engine.register(GA);
    // Reach past the public API the way a careless refactor would.
    const inject = (engine as unknown as { inject(t: TrackerDefinition): void }).inject.bind(engine);
    expect(() => inject(GA)).toThrow(ConsentViolationError);
    expect(scripts('google-analytics')).toHaveLength(0);
  });

  it('exposes no way to obtain the script element from a declaration', async () => {
    const ui = createMemoryUi();
    const consent = createConsent({ trackers: [GA], ui, reloadOnRevoke: false });
    await consent.ready;
    // registerTracker returns void by design: there is no handle to force-load with.
    expect(consent.registerTracker({ id: 'x', category: 'analytics', code: 'void 0' })).toBeUndefined();
    consent.destroy();
  });
});
