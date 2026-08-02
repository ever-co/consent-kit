# consent-gate

> **npm package:** `consent-gate` · **repo:** `ever-co/consent-kit`
> The name `consent-kit` was already taken on npm by an unrelated 2022 package. The published name is
> deliberately unscoped and entity-neutral — separate companies depend on this, and it should look like the
> ordinary OSS library it is, not like anyone's in-house package.

**Tracker gating that is structural, not a convention.**

You declare a tracker with a category. `consent-gate` owns injection and refuses to load it until that
category is granted. There is no API that hands you a `<script>` element, no "load now" escape hatch, and no
way to register a tracker that fires early — because that is the bug this package exists to remove.

The usual failure mode looks like this:

```tsx
// ❌ fires on first paint, before anyone has chosen anything
<Script src="https://www.googletagmanager.com/gtag/js?id=G-XXX" />
<Script id="ph">{`posthog.init(...)`}</Script>
<CookieBanner />          // decorative: it gates nothing
```

A banner rendered as a sibling of the trackers it is supposed to gate does not gate them. `consent-gate`
makes that arrangement impossible to express.

- Vanilla core, ~5.2 kB min+gzip (~15.5 kB with the CookieConsent UI, which loads dynamically). No
  framework required.
- Optional thin React wrapper. React is a **peer** dependency (`^18.2 || ^19`) — never bundled, never pinned.
- Works with Next.js 15 and 16 (App Router and Pages), React 18 and 19, Angular, and plain HTML.
- Wraps [CookieConsent v3](https://cookieconsent.orestbida.com) by Orest Bida (MIT) for the UI.
- TypeScript types shipped.
- MIT.

---

## Install

```bash
npm install consent-gate
```

`vanilla-cookieconsent` comes along as a dependency. React is optional — install nothing extra for
vanilla/Angular/plain HTML use.

---

## The four categories

| Category      | Granted            | For                                                        |
| ------------- | ------------------ | ---------------------------------------------------------- |
| `necessary`   | always, read-only  | security, load balancing, storing the consent choice itself |
| `analytics`   | opt-in             | GA4, GTM, PostHog, Plausible, Matomo, Clarity, Hotjar       |
| `marketing`   | opt-in             | Meta Pixel, LinkedIn Insight, Google Ads, TikTok, Reddit    |
| `preferences` | opt-in             | remembering theme, locale, region                           |

Declaring a well-known tracker under `necessary` **throws at registration**. There is no override — that
check is the point of the package.

```ts
// ConsentConfigError: … looks like a known non-essential tracker (googletagmanager.com).
// Analytics, tag managers and ad pixels are never strictly necessary.
{ id: 'gtm', category: 'necessary', src: 'https://www.googletagmanager.com/gtm.js?id=GTM-X' }
```

---

## Next.js App Router

### 1. `app/consent.ts` — declare every tracker in one place

```ts
import { defineTrackers } from 'consent-gate';

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
    // Already bundled in your app? Use onGrant — it runs at the same moment a
    // script would be injected, and never before.
    onGrant: async () => {
      const posthog = (await import('posthog-js')).default;
      posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        api_host: '/ingest',
        persistence: 'localStorage+cookie',
      });
    },
    onRevoke: () => import('posthog-js').then((m) => m.default.opt_out_capturing()),
  },
  {
    id: 'linkedin-insight',
    category: 'marketing',
    src: 'https://snap.licdn.com/li.lms-analytics/insight.min.js',
    cookies: [/^li_/, 'bcookie', 'lidc'],
  },
]);
```

### 2. `app/layout.tsx` — mount the provider

```tsx
import { ConsentProvider } from 'consent-gate/react';
import { trackers } from './consent';
import 'consent-gate/styles.css';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ConsentProvider
          trackers={trackers}
          policyVersion="2026-08-01"
          copy={{ privacyPolicyHref: '/privacy' }}
        >
          {children}
        </ConsentProvider>
      </body>
    </html>
  );
}
```

`ConsentProvider` is a client component (`"use client"` is baked into the published build) and renders no
markup of its own, so it is safe at the root of a Server Component tree.

### 3. Footer — the persistent preference-centre entry point

```tsx
'use client';
import { PreferencesButton } from 'consent-gate/react';

export function Footer() {
  return (
    <footer>
      <a href="/privacy">Privacy</a>
      <PreferencesButton className="link">Cookie preferences</PreferencesButton>
    </footer>
  );
}
```

Withdrawing has to be as easy as granting, so ship this on every page.

### 4. Gate embedded markup (not scripts)

```tsx
'use client';
import { ConsentGate } from 'consent-gate/react';

export function Demo() {
  return (
    <ConsentGate
      category="marketing"
      fallback={<p>Enable marketing cookies to watch this video.</p>}
    >
      <iframe src="https://www.youtube.com/embed/…" title="Product demo" />
    </ConsentGate>
  );
}
```

Third-party **scripts** should be declared as trackers instead — `ConsentGate` is for iframes and embeds.

### Reading state anywhere

```tsx
'use client';
import { useConsent } from 'consent-gate/react';

export function AnalyticsBadge() {
  const { ready, isGranted, hasLoaded, record, showPreferences, rejectAll } = useConsent();
  if (!ready) return null;
  return (
    <p>
      analytics: {isGranted('analytics') ? 'on' : 'off'} · GA loaded:{' '}
      {String(hasLoaded('google-analytics'))} · chosen {record?.updatedAt}
      <button onClick={showPreferences}>change</button>
      <button onClick={rejectAll}>withdraw</button>
    </p>
  );
}
```

---

## Plain HTML / Angular / anything else

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>consent-gate — plain HTML</title>
    <link rel="stylesheet" href="https://unpkg.com/consent-gate/dist/styles.css" />
  </head>
  <body>
    <h1>Hello</h1>

    <!-- Persistent preference-centre entry point. Works with a plain attribute. -->
    <footer>
      <a href="/privacy">Privacy</a>
      <button type="button" data-cc="show-preferencesModal">Cookie preferences</button>
    </footer>

    <script type="module">
      import { initConsent } from 'https://unpkg.com/consent-gate/dist/index.js';

      const consent = initConsent({
        policyVersion: '2026-08-01',
        copy: { privacyPolicyHref: '/privacy' },
        trackers: [
          {
            id: 'google-analytics',
            category: 'analytics',
            src: 'https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX',
            cookies: [/^_ga/, '_gid'],
          },
          {
            id: 'google-analytics-config',
            category: 'analytics',
            code: `window.dataLayer=window.dataLayer||[];
                   function gtag(){dataLayer.push(arguments)}
                   gtag('js', new Date());
                   gtag('config','G-XXXXXXX',{anonymize_ip:true});`,
          },
          {
            id: 'meta-pixel',
            category: 'marketing',
            src: 'https://connect.facebook.net/en_US/fbevents.js',
          },
        ],
        onChange: (record, granted) => {
          console.log('consent is now', granted, record);
        },
      });

      // Nothing above loaded yet. It cannot load until the user says yes.
      document.querySelector('#withdraw')?.addEventListener('click', () => consent.reset());
    </script>
  </body>
</html>
```

For Angular, call `initConsent(...)` once in `APP_INITIALIZER` (or `main.ts`) and read state via
`getConsent()`. Nothing in the core touches React.

Bundling locally instead of unpkg? Import `consent-gate` and `consent-gate/styles.css` from your entry file.

---

## Migrating off Iubenda — read this before you delete anything

`consent-gate` re-emits the DOM event **`iubenda_consent_given`** when consent is granted.

At least one site gates its analytics on a hand-rolled listener for that exact event, and it is the one
place where gating currently works. Removing Iubenda must not silently remove a working gate, so the bridge
is **on by default**:

```js
// Existing code on the site — keeps working unchanged after the swap.
document.addEventListener('iubenda_consent_given', () => {
  loadAnalytics();
});
```

Behaviour:

- Dispatched on `document` with `bubbles: true`, so both `document` and `window` listeners fire — once each.
- Fires only when **`analytics` or `marketing`** is granted. A reject-all fires nothing.
- Fires once per grant. A withdraw → re-grant cycle re-arms it and fires again.
- `event.detail` carries `{ source: 'consent-gate', consent: true, categories, record }`.

Tune or disable it:

```ts
initConsent({
  trackers,
  legacyEvents: { names: ['iubenda_consent_given'], categories: ['analytics'] },
  // legacyEvents: false,   // once nothing listens for it any more
});
```

**Recommended migration order:** ship `consent-gate` with the bridge on → move each legacy listener over to a
declared tracker → only then set `legacyEvents: false`.

---

## Compliance behaviour

Baked in, not left to the integrator:

- **Reject is as easy as accept, at the first layer.** "Accept all" and "Reject all" sit side by side in the
  banner with `equalWeightButtons`, and neither is demoted to the secondary style.
- **No pre-ticked boxes.** `analytics`, `marketing` and `preferences` are off until switched on; `necessary`
  is on and read-only.
- **Nothing non-essential before a choice.** Trackers are injected only from the consent callback, behind an
  assertion. There is no code path that injects before a decision.
- **Granular per category** in the preference centre.
- **Withdrawal as easy as granting** — reject-all is present in the preference centre too, and `reset()`
  clears the stored record.
- **A persistent entry point** — `showPreferences()`, `<PreferencesButton>`, or
  `data-cc="show-preferencesModal"` on any element.
- **A stored consent record** — id, revision, your `policyVersion`, granted categories, first and last
  timestamps, language. First-party, and the only thing written before a choice is nothing at all.
- **No cookie wall, no consent-or-pay.** `disablePageInteraction: true` throws.
- **Withdrawal actually stops the tracker** — the injected node is removed, declared cookies are cleared,
  `onRevoke` runs, and the page reloads (a loaded third-party script cannot otherwise be unloaded). Set
  `reloadOnRevoke: false` if you handle teardown yourself.

Configurations that would undo any of this are refused at construction time:

```ts
initConsent({ cmp: { mode: 'opt-out' } });             // throws
initConsent({ cmp: { disablePageInteraction: true } }); // throws — cookie wall
initConsent({ cmp: { manageScriptTags: true } });       // throws — bypasses the gate
initConsent({ cmp: { categories: { analytics: { enabled: true } } } }); // throws — pre-ticked
```

What the package does **not** do for you: write your privacy policy, decide your legal basis, or handle
TCF/IAB or Google Consent Mode signalling. Add Consent Mode as a `necessary`-category inline tracker that
sets defaults to `denied`, then update it from `onChange`.

---

## API

### `initConsent(options): ConsentInstance`

Page-wide singleton — safe to call repeatedly (StrictMode, hot reload, multiple entry points). Extra
`trackers` on later calls are merged in.

### `createConsent(options): ConsentInstance`

An isolated instance. For tests and multi-root pages.

### `getConsent(): ConsentInstance | null`

### Options

| Option           | Default                | Notes                                                     |
| ---------------- | ---------------------- | --------------------------------------------------------- |
| `trackers`       | `[]`                   | Declarations. Registering never injects.                   |
| `policyVersion`  | –                      | Stored in the consent record.                               |
| `revision`       | `0`                    | Increment to invalidate stored consent and re-ask.          |
| `autoShow`       | `true`                 | Show the notice when there is no valid consent.             |
| `cookie`         | `cg_consent`, 182 days | `name`, `domain`, `path`, `sameSite`, `expiresAfterDays`.   |
| `reloadOnRevoke` | `true`                 | Reload when a granted category is withdrawn.                |
| `legacyEvents`   | Iubenda bridge on      | `false` to disable.                                         |
| `language`       | `'en'`                 |                                                             |
| `copy`           | built-in English       | Banner/preference text, `privacyPolicyHref`.                |
| `onChange`       | –                      | `(record, granted) => void`, incl. the restore on load.     |
| `cmp`            | –                      | Extra CookieConsent v3 config; compliance keys are refused. |
| `ui`             | CookieConsent v3       | Swap the UI. See `consent-gate/testing`.                    |

### Tracker declaration

| Field                  | Notes                                                       |
| ---------------------- | ----------------------------------------------------------- |
| `id`                   | stable slug, used for de-duplication and `hasLoaded(id)`     |
| `category`             | `necessary` \| `analytics` \| `marketing` \| `preferences`   |
| `src` \| `code`        | external script or inline script — one of them, not both     |
| `onGrant` / `onRevoke` | side effect / teardown for SDKs already in your bundle       |
| `cookies`              | names or RegExps cleared on withdrawal                       |
| `attributes`           | extra attributes on the injected `<script>` (`nonce`, …)     |
| `async`, `defer`, `type`, `appendTo` | script tag tuning                              |

### Instance

`ready` · `isGranted(category)` · `grantedCategories()` · `hasLoaded(id)` · `getRecord()` ·
`registerTracker(t)` · `accept(cats \| 'all' \| 'necessary')` · `acceptAll()` · `rejectAll()` ·
`showBanner()` · `showPreferences()` · `reset()` · `onChange(fn)` · `destroy()`

Injected scripts carry `data-consent-tracker="<id>"` and `data-consent-category="<category>"`, so you can
audit a live page:

```js
[...document.querySelectorAll('script[data-consent-tracker]')].map((s) => s.dataset.consentTracker);
```

---

## Testing your own integration

`consent-gate/testing` ships a headless UI adapter so you can assert the gate in your own suite:

```ts
import { createConsent } from 'consent-gate';
import { createMemoryUi } from 'consent-gate/testing';
import { trackers } from '../app/consent';

it('loads no tracker before consent', async () => {
  const ui = createMemoryUi();
  const consent = createConsent({ trackers, ui, reloadOnRevoke: false });
  await consent.ready;

  expect(document.querySelectorAll('script[data-consent-tracker]')).toHaveLength(0);

  ui.grant(['analytics']);
  expect(consent.hasLoaded('google-analytics')).toBe(true);
});
```

---

## Development

```bash
npm install
npm test          # vitest, jsdom — includes an end-to-end pass against the real CookieConsent UI
npm run typecheck
npm run build
npm run verify    # post-build: ESM + CJS entries resolve, "use client" survived, types + CSS present
```

## Credits

UI by [CookieConsent v3](https://github.com/orestbida/cookieconsent) (Orest Bida, MIT). See
[THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
