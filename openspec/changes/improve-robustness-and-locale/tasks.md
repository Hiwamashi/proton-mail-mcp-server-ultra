# Tasks

## 1. Test infrastructure

- [ ] 1.1 Add `setImapClientFactory` and a fake IMAP client under `test/helpers/`; verify with a first test that `withImapClient` uses the fake
- [ ] 1.2 Add handler tests: read retried once after a connection error, write not retried, non-connection error not retried, `update_draft` appends before deleting and warns on failed delete, `send_draft` warns on failed cleanup; verify all pass with `npm test`
- [ ] 1.3 Add `.github/workflows/ci.yml` (Node 20/22, test, build); verify the workflow passes on a push

## 2. Locale and time zone

- [ ] 2.1 Implement `src/locale.js` and startup validation in `src/config.js`; verify with unit tests for all five locales, an invalid locale and an invalid time zone
- [ ] 2.2 Use it in `quoteAttribution` (and the forward header if `add-mailbox-write-tools` is implemented); verify round-trip tests: attribution of each locale is removed by `stripQuoted`

## 3. Folder cache and listing

- [ ] 3.1 Move the special-use cache per connection and clear it on "mailbox does not exist"; verify with the fake client that a renamed Trash is picked up after reconnect
- [ ] 3.2 Update the `list_emails` description to state arrival order and point to `search_emails`; verify the description text in a registration test

## 4. Version

- [ ] 4.1 Inject the package version in `build.mjs` and use it in `server.js`; verify via `scripts/smoke.mjs` that the initialize result reports the `package.json` version

## 5. Dependency security

- [ ] 5.1 Review the nodemailer 7.x–10.x changelogs for `createTransport` (STARTTLS, `tls.rejectUnauthorized`) and `lib/mail-composer`; record breaking changes that affect us in design.md
- [ ] 5.2 Upgrade `nodemailer` to ^10 and adapt `src/connections.js` / `src/compose.js` if needed; verify `npm audit` shows no high-severity advisory, `npm test` and `npm run build` pass, and `scripts/smoke.mjs --drafts` creates, updates and deletes a draft against the Bridge

## 6. Documentation

- [ ] 6.1 Update `feature-documentation/compose/reply-logic.md`, `configuration.md`, `connections/imap-connection-reuse.md`, `reading/list-emails.md` (DE+EN) and add `feature-documentation/testing.md` (DE+EN) describing the fake client and CI
- [ ] 6.2 Update README (DE+EN) settings table and PROGRESS.md (including the nodemailer upgrade); verify `npm test` and `npm run build` pass
