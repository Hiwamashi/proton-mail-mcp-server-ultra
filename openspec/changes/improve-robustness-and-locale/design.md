# Design

## Context

`quoteAttribution` in `src/compose.js` uses a module-level `Intl.DateTimeFormat("de-DE", …, "Europe/Berlin")` and a German template; `stripQuoted` in `src/content.js` already recognizes de/en/fr/es/it headers. `specialFolderCache` in `src/connections.js` is a module-level object never reset. `server.js` hard-codes version `1.0.0`. `withImapClient` creates clients through a private `createImapClient`, so tests cannot inject a fake. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Locale handling in one table shared by reply quotes, forward headers and quote stripping.
- Tests for the connection guarantees without a running Bridge.

**Non-Goals:**
- Translating tool descriptions or error messages (stay English).
- A full IMAP server emulator.

## Decisions

### Locale table
`src/locale.js` exports per locale: `attribution(date, sender)`, forward header labels and the regex used by `stripQuoted`. `stripQuoted` keeps matching all locales regardless of configuration, because incoming mail can be in any language. Validation at startup: locale in the table; time zone via `new Intl.DateTimeFormat("en", { timeZone })` throwing `RangeError`.

### Folder cache per connection
Move `specialFolderCache` onto the client object (`WeakMap<ImapFlow, Map>`), so a new connection starts empty. On a `NONEXISTENT`/"Mailbox doesn't exist" response for a resolved folder, clear the entry; reads go through the existing single retry, writes return the error.

### Version injection
`build.mjs` defines `__PKG_VERSION__` from `package.json` via esbuild `define`; when running from `src/` (tests), `server.js` falls back to reading `package.json` with `createRequire`. Alternative: JSON import attributes – rejected for Node 20 compatibility of the bundled output.

### Test seam
`connections.js` exports `setImapClientFactory(fn)` (test-only, documented as such) used instead of `createImapClient`. A small fake implements `connect`, `usable`, `getMailboxLock`, `fetchOne`, `fetch`, `search`, `append`, `messageMove`, `messageDelete`, `messageFlagsAdd/Remove`, `list`, `logout`, `close` with scripted failures. Tool handlers are tested by registering them on a stub server that captures handlers.

### CI
`.github/workflows/ci.yml`: matrix Node 20 and 22, `npm ci`, `npm test`, `npm run build`. No secrets, no Bridge.

### nodemailer upgrade
Planned on 2026-10-03 after `add-reading-tools`: `npm audit` flags `nodemailer <= 10.0.5` (high; among others SMTP command injection via CRLF, header injection in List-* comments, addressparser DoS). The fix is only available in 10.x, i.e. four major versions above the pinned ^6.10.1; `mailparser` already pulls 10.0.13 as its own dependency. We use two surfaces: `createTransport` (SMTP to the Bridge with STARTTLS, self-signed cert) and `nodemailer/lib/mail-composer` (raw MIME for drafts). Approach: read the 7.x–10.x changelogs for these two surfaces first, upgrade, then compare the MIME of the existing compose tests and run `scripts/smoke.mjs --drafts` against the Bridge. Done here because the CI from this change catches regressions and the handler tests cover send and draft paths.

## Risks / Trade-offs

- [Fake drifts from imapflow behavior] → Keep the fake minimal, assert only on our own logic (retry counts, call order), and keep `scripts/smoke.mjs` as the real-Bridge check.
- [Locale attribution not recognized by other clients' quote detection] → Formats follow the common Gmail/Apple Mail patterns per language.
- [nodemailer 10 changes MIME output or the internal `lib/mail-composer` path] → Changelog review first; compose tests compare headers and structure; smoke test with drafts against the Bridge before the change is done.
