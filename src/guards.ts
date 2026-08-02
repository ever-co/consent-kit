import { CONSENT_CATEGORIES, type ConsentCategory, type ConsentOptions, type TrackerDefinition } from './types.js';

/** Thrown when the library is asked to do something that would break consent gating. */
export class ConsentViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsentViolationError';
  }
}

/** Thrown when a tracker or config is declared in a way that cannot be made compliant. */
export class ConsentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConsentConfigError';
  }
}

/**
 * Hosts and inline-code signatures of well-known non-essential trackers.
 *
 * These exist for exactly one reason: to make it impossible to smuggle GA /
 * GTM / PostHog / Meta into the `necessary` category, which is the standard way
 * a "we have a cookie banner" site ends up with no gating at all.
 */
const KNOWN_TRACKER_HOSTS: RegExp[] = [
  // Google — deliberately NOT plain `google.com`, because reCAPTCHA is served
  // from www.google.com and anti-fraud is a defensible `necessary` use.
  /(^|\.)google-analytics\.com$/i,
  /(^|\.)googletagmanager\.com$/i,
  /(^|\.)googleadservices\.com$/i,
  /(^|\.)googlesyndication\.com$/i,
  /(^|\.)doubleclick\.net$/i,
  // Meta
  /(^|\.)facebook\.net$/i,
  /(^|\.)facebook\.com$/i,
  // Product analytics / session replay
  /(^|\.)posthog\.com$/i,
  /(^|\.)hotjar\.com$/i,
  /(^|\.)clarity\.ms$/i,
  /(^|\.)segment\.(com|io)$/i,
  /(^|\.)mixpanel\.com$/i,
  /(^|\.)mxpnl\.com$/i,
  /(^|\.)amplitude\.com$/i,
  /(^|\.)heap(analytics)?\.com$/i,
  /(^|\.)fullstory\.com$/i,
  /(^|\.)mouseflow\.com$/i,
  /(^|\.)matomo\.cloud$/i,
  /(^|\.)mc\.yandex\.ru$/i,
  // Ads / retargeting
  /(^|\.)licdn\.com$/i,
  /(^|\.)ads-twitter\.com$/i,
  /(^|\.)tiktok\.com$/i,
  /(^|\.)redditstatic\.com$/i,
  /(^|\.)pinimg\.com$/i,
  /(^|\.)criteo\.(com|net)$/i,
  /(^|\.)taboola\.com$/i,
  /(^|\.)outbrain\.com$/i,
  /(^|\.)bat\.bing\.com$/i,
  // Marketing automation / experimentation
  /(^|\.)hs-scripts\.com$/i,
  /(^|\.)hubspot\.com$/i,
  /(^|\.)visualwebsiteoptimizer\.com$/i,
  /(^|\.)optimizely\.com$/i,
];

const KNOWN_TRACKER_PATH_HINTS: RegExp[] = [
  /\/gtag\/js/i,
  /\/gtm\.js/i,
  /\/analytics\.js/i,
  /\/fbevents\.js/i,
  /\/matomo\.js/i,
  /\/piwik\.js/i,
  /\/plausible(\.[a-z-]+)*\.js/i,
];

const KNOWN_INLINE_SIGNATURES: RegExp[] = [
  /\bgtag\s*\(/,
  /\bdataLayer\s*(\.|\[)/,
  /\bfbq\s*\(/,
  /\bposthog\s*\.\s*init\s*\(/,
  /\b_paq\s*\./,
  /\bmixpanel\s*\.\s*init\s*\(/,
  /\bamplitude\s*\.\s*(init|getInstance)\s*\(/,
  /\bclarity\s*\(/,
  /\bhj\s*\(/,
  /\bttq\s*\./,
  /\blintrk\s*\(/,
  /\bsnaptr\s*\(/,
];

function hostOf(src: string): string | null {
  try {
    return new URL(src, 'https://consent-gate.invalid').hostname;
  } catch {
    return null;
  }
}

/** True when `src`/`code` look like a well-known non-essential tracker. */
export function looksLikeKnownTracker(tracker: TrackerDefinition): string | null {
  if (tracker.src) {
    const host = hostOf(tracker.src);
    if (host && KNOWN_TRACKER_HOSTS.some((re) => re.test(host))) return host;
    if (KNOWN_TRACKER_PATH_HINTS.some((re) => re.test(tracker.src as string))) return tracker.src;
  }
  if (tracker.code) {
    const hit = KNOWN_INLINE_SIGNATURES.find((re) => re.test(tracker.code as string));
    if (hit) return `inline code matching ${hit}`;
  }
  return null;
}

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/;

/**
 * Validate a tracker declaration.
 * Throws rather than warns: a mis-declared tracker is a compliance defect, and
 * a warning in a build log is exactly how 20 of 21 sites got here.
 */
export function assertValidTracker(tracker: TrackerDefinition): void {
  if (!tracker || typeof tracker !== 'object') {
    throw new ConsentConfigError('Tracker declaration must be an object.');
  }
  if (!tracker.id || !ID_RE.test(tracker.id)) {
    throw new ConsentConfigError(
      `Tracker id ${JSON.stringify(tracker.id)} is invalid. Use a stable slug like "google-analytics".`,
    );
  }
  if (!CONSENT_CATEGORIES.includes(tracker.category)) {
    throw new ConsentConfigError(
      `Tracker "${tracker.id}" has category ${JSON.stringify(tracker.category)}. ` +
        `Valid categories: ${CONSENT_CATEGORIES.join(', ')}.`,
    );
  }
  if (!tracker.src && !tracker.code && !tracker.onGrant) {
    throw new ConsentConfigError(
      `Tracker "${tracker.id}" declares nothing to do. Provide one of: src, code, onGrant.`,
    );
  }
  if (tracker.src && tracker.code) {
    throw new ConsentConfigError(`Tracker "${tracker.id}" sets both src and code. Pick one.`);
  }
  if (tracker.src && /^\s*javascript:/i.test(tracker.src)) {
    throw new ConsentConfigError(`Tracker "${tracker.id}" has a javascript: src.`);
  }

  if (tracker.category === 'necessary') {
    const hit = looksLikeKnownTracker(tracker);
    if (hit) {
      throw new ConsentConfigError(
        `Tracker "${tracker.id}" is declared as category "necessary" but looks like a known ` +
          `non-essential tracker (${hit}). Analytics, tag managers and ad pixels are never ` +
          `strictly necessary — declare it as "analytics" or "marketing". ` +
          `There is no override: this check is the whole point of the package.`,
      );
    }
  }
}

/**
 * Reject configurations that are structurally non-compliant, regardless of copy:
 * cookie walls, opt-out mode, pre-ticked categories, unequal accept/reject
 * buttons, and CMP-managed script tags (which would bypass our own gating).
 */
export function assertCompliantOptions(options: ConsentOptions): void {
  const cmp = options.cmp ?? {};

  if (cmp.disablePageInteraction === true) {
    throw new ConsentConfigError(
      'cmp.disablePageInteraction: true builds a cookie wall (page unusable until a choice is made). Not allowed.',
    );
  }
  if (cmp.mode === 'opt-out') {
    throw new ConsentConfigError(
      'cmp.mode: "opt-out" would fire trackers before a choice. consent-gate is opt-in only.',
    );
  }
  if (cmp.manageScriptTags === true) {
    throw new ConsentConfigError(
      'cmp.manageScriptTags: true hands script injection back to the CMP and bypasses consent-gate gating. ' +
        'Declare trackers through `trackers` instead.',
    );
  }
  if (cmp.categories) {
    throw new ConsentConfigError(
      'cmp.categories cannot be overridden — categories are fixed to necessary/analytics/marketing/preferences ' +
        'with necessary read-only and everything else off by default.',
    );
  }
  if (cmp.autoClearCookies === false) {
    throw new ConsentConfigError('cmp.autoClearCookies: false would leave cookies behind after withdrawal.');
  }

  const gui = cmp.guiOptions as Record<string, { equalWeightButtons?: boolean }> | undefined;
  if (gui) {
    for (const key of ['consentModal', 'preferencesModal']) {
      if (gui[key]?.equalWeightButtons === false) {
        throw new ConsentConfigError(
          `cmp.guiOptions.${key}.equalWeightButtons: false makes rejecting visually harder than accepting. Not allowed.`,
        );
      }
    }
  }

  if (options.revision !== undefined && (!Number.isInteger(options.revision) || options.revision < 0)) {
    throw new ConsentConfigError('revision must be a non-negative integer.');
  }
}

/** Guard used at the injection site itself — the last line of defence. */
export function assertGranted(granted: ReadonlySet<ConsentCategory>, tracker: TrackerDefinition): void {
  if (!granted.has(tracker.category)) {
    throw new ConsentViolationError(
      `Refusing to inject tracker "${tracker.id}": category "${tracker.category}" is not granted.`,
    );
  }
}
