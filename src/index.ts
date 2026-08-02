export { createConsent, defineTrackers, getConsent, initConsent } from './core.js';
export { ConsentEngine, CATEGORY_ATTR, TRACKER_ATTR, type EngineOptions } from './engine.js';
export {
  assertCompliantOptions,
  assertValidTracker,
  ConsentConfigError,
  ConsentViolationError,
  looksLikeKnownTracker,
} from './guards.js';
export {
  DEFAULT_LEGACY_EVENT_CATEGORIES,
  DEFAULT_LEGACY_EVENT_NAMES,
  IUBENDA_CONSENT_EVENT,
  LegacyEventBridge,
  type LegacyEventDetail,
} from './legacy.js';
export { CookieConsentUi, toConsentRecord } from './ui-cookieconsent.js';
export {
  CONSENT_CATEGORIES,
  GATED_CATEGORIES,
  type CategoryCopy,
  type ConsentCategory,
  type ConsentChangeListener,
  type ConsentCookieOptions,
  type ConsentCopy,
  type ConsentInstance,
  type ConsentOptions,
  type ConsentRecord,
  type ConsentUiAdapter,
  type ConsentUiContext,
  type GatedCategory,
  type LegacyEventOptions,
  type TrackerDefinition,
  type TrackerGrantContext,
} from './types.js';
