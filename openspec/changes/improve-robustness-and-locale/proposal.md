# Proposal

## Why

Several small issues make the server less robust or less useful outside the author's setup: the reply quote is always German in Europe/Berlin time, a renamed Drafts or Trash folder needs a server restart, `list_emails` does not say that its order is by arrival in the folder (misleading in "All Mail"), the reported server version is hard-coded, and the connection and tool-handler logic – including the no-duplicate guarantees – has no automated tests or CI. In addition, `npm audit` reports a high-severity advisory for the direct dependency `nodemailer` (^6.10.1; fixed only in 10.x), which is used for SMTP sending and for building draft MIME.

## What Changes

- Quote attribution (and the forward header from `add-mailbox-write-tools`) configurable via `PROTON_MCP_LOCALE` (`de`, `en`, `fr`, `es`, `it`) and `PROTON_MCP_TIMEZONE` (IANA name). Defaults stay `de` and `Europe/Berlin`.
- Special-use folders are resolved again for every new IMAP connection and after a "mailbox does not exist" error.
- `list_emails` documents and specifies its ordering; its description points to `search_emails` for date order across a folder.
- The MCP server reports the version from `package.json`.
- Test seam for the IMAP client, handler tests for retry/no-retry, draft replacement and send cleanup; GitHub Actions CI running tests and build on Node 20 and 22.
- `nodemailer` upgraded from ^6.10.1 to the current major (10.x) so `npm audit` reports no high-severity advisory; SMTP sending and MIME building keep their behavior.
- Not breaking: all defaults match the current behavior.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `mail-sending`: "Quoted original" – language and time zone configurable.
- `bridge-connection`: "Special-use folder resolution" – refreshed per connection; ADDED requirement for the reported version.
- `mail-reading`: "List newest emails" – ordering specified.

## Impact

- Code: `src/compose.js`, `src/config.js`, `src/connections.js`, `src/server.js`, `src/tools/mailbox.js`, `build.mjs` (version injection), new `test/*.test.js`, new `.github/workflows/ci.yml`.
- Dependency: `nodemailer` ^6.10.1 → ^10 (affects `src/connections.js` SMTP transport and `src/compose.js` `MailComposer`).
- Independent of the other changes; the locale also applies to the forward header once `add-mailbox-write-tools` is implemented (whichever lands second wires it up).
