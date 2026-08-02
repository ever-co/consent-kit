# Changelog

## 0.1.0 — unreleased

First release.

- Declarative tracker registration: the library owns injection and refuses to load a tracker until its
  category is granted. No API returns a script element or a "load now" handle.
- Categories: `necessary` (always, read-only), `analytics`, `marketing`, `preferences`.
- Declaring a well-known tracker (GA/GTM/Meta/PostHog/Hotjar/Clarity/…) under `necessary` throws.
- Compliance defaults locked in: opt-in only, reject as easy as accept at the first layer, no pre-ticked
  boxes, no cookie wall, auto-clear on withdrawal, persistent preference centre, stored consent record.
- Migration bridge: re-emits the `iubenda_consent_given` DOM event on grant so existing hand-rolled
  listeners keep working.
- Vanilla core plus an optional React wrapper (`consent-gate/react`); React is a peer dependency
  (`^18.2 || ^19`) and is never bundled.
- Headless test adapter at `consent-gate/testing`.
- ESM + CJS + TypeScript types; `"use client"` preserved on the React entry for Next.js App Router.
