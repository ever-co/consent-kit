import { defineTrackers } from 'consent-gate';

/**
 * Every third-party tracker on the site, in one place.
 *
 * Nothing here can load before its category is granted — there is no code path
 * in consent-gate that injects a declared tracker outside the consent callback.
 */
export const trackers = defineTrackers([
  {
    id: 'google-analytics',
    category: 'analytics',
    src: `https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`,
    cookies: [/^_ga/, '_gid'],
  },
  {
    id: 'google-analytics-config',
    category: 'analytics',
    code: `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments)}
      gtag('js', new Date());
      gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', { anonymize_ip: true });
    `,
  },
  {
    id: 'posthog',
    category: 'analytics',
    // The SDK is bundled with the app, so there is no script to inject —
    // onGrant runs at exactly the moment a script would have been added.
    onGrant: async () => {
      const posthog = (await import('posthog-js')).default;
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY as string, {
        api_host: '/ingest',
        person_profiles: 'identified_only',
      });
    },
    onRevoke: async () => {
      const posthog = (await import('posthog-js')).default;
      posthog.opt_out_capturing();
    },
    cookies: [/^ph_/],
  },
  {
    id: 'linkedin-insight',
    category: 'marketing',
    src: 'https://snap.licdn.com/li.lms-analytics/insight.min.js',
    cookies: [/^li_/, 'bcookie', 'lidc'],
  },
]);
