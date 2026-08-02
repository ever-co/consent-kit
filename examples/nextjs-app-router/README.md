# Next.js App Router example

Reference wiring, not a runnable project — drop these four files into an existing Next 15 or 16 app.

| File             | Role                                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| `app/consent.ts` | every tracker on the site, declared once                                  |
| `app/layout.tsx` | mounts `<ConsentProvider>` at the root — **no `<Script>` tags anywhere**  |
| `app/footer.tsx` | the persistent preference-centre entry point                             |
| `app/page.tsx`   | reading state, and gating an embedded iframe with `<ConsentGate>`         |

```bash
npm install consent-gate
```

```bash
# .env.local
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxx
```

## What to check after wiring it up

1. Load the site in a clean profile. In devtools → Network, filter for `googletagmanager` /
   `licdn` / your PostHog host: **nothing** should be requested.
2. Console: `document.querySelectorAll('script[data-consent-tracker]').length` → `0`.
3. Application → Cookies: only `cg_consent` appears, and only **after** you choose.
4. Click **Reject all** → still nothing loads.
5. Click **Accept all** → each tracker appears exactly once.
6. Footer → **Cookie preferences** → toggle analytics off → save. The page reloads and the tracker is gone.

## Migrating an existing site

The point of moving to `consent-gate` is deleting the `<Script>` tags. If a `<Script src="…gtag/js…">`
survives in `layout.tsx`, it still fires on first paint and the banner is still decorative — the package
cannot help with a tracker it was never told about.

```diff
- <Script src="https://www.googletagmanager.com/gtag/js?id=G-XXX" strategy="afterInteractive" />
- <Script id="ga-config">{`gtag('config','G-XXX')`}</Script>
+ // moved into app/consent.ts as declared trackers
```

Grep for what you might have missed:

```bash
grep -rnE "googletagmanager|google-analytics|posthog|fbevents|clarity\.ms|hotjar|licdn" app/ src/ --include='*.tsx' --include='*.ts'
```
