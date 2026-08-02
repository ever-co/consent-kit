'use client';

import { ConsentGate, useConsent } from 'consent-gate/react';

export default function Home() {
  const { ready, isGranted, hasLoaded, showPreferences, rejectAll } = useConsent();

  return (
    <main>
      <h1>consent-gate — Next.js App Router</h1>

      <p>
        Analytics: <strong>{isGranted('analytics') ? 'granted' : 'not granted'}</strong> · GA script in the
        DOM: <strong>{ready ? String(hasLoaded('google-analytics')) : '…'}</strong>
      </p>

      {/* Embedded markup is gated declaratively. Scripts are declared in ./consent.ts instead. */}
      <ConsentGate
        category="marketing"
        fallback={
          <p>
            This video needs marketing cookies.{' '}
            <button type="button" onClick={showPreferences}>
              Manage preferences
            </button>
          </p>
        }
      >
        <iframe
          width="560"
          height="315"
          src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
          title="Product demo"
          allowFullScreen
        />
      </ConsentGate>

      <button type="button" onClick={rejectAll}>
        Withdraw consent
      </button>
    </main>
  );
}
