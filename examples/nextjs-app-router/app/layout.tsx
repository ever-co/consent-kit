import type { ReactNode } from 'react';
import { ConsentProvider } from 'consent-gate/react';
import { trackers } from './consent';
import { Footer } from './footer';
import 'consent-gate/styles.css';

/**
 * ConsentProvider is a client component and renders no markup of its own, so it
 * is safe at the root of a Server Component tree.
 *
 * Note what is NOT here: no <Script> tags. Every tracker lives in ./consent.ts.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConsentProvider
          trackers={trackers}
          policyVersion="2026-08-01"
          copy={{ privacyPolicyHref: '/privacy' }}
        >
          {children}
          <Footer />
        </ConsentProvider>
      </body>
    </html>
  );
}
