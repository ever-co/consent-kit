'use client';

import { PreferencesButton, useConsent } from 'consent-gate/react';

/**
 * The persistent preference-centre entry point. Ship it on every page:
 * withdrawing consent has to be as easy as granting it.
 */
export function Footer() {
  const { ready, granted, record } = useConsent();

  return (
    <footer>
      <nav>
        <a href="/privacy">Privacy policy</a>
        <PreferencesButton className="link">Cookie preferences</PreferencesButton>
      </nav>
      {ready && record ? (
        <small>
          Cookie choice saved {new Date(record.updatedAt).toLocaleDateString()} — {granted.join(', ')}
        </small>
      ) : null}
    </footer>
  );
}
