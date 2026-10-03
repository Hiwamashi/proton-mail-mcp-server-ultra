**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# Tests, Fake-Clients und CI

**Dateien:** test/*.test.js, test/helpers/, src/connections.js (`setImapClientFactory`, `setSmtpTransportFactory`), .github/workflows/ci.yml, scripts/smoke.mjs

## Überblick

| Ebene | Werkzeug | Läuft wo |
|---|---|---|
| Unit- und Handler-Tests | `node:test` (`npm test`) | lokal und in der CI, ohne Bridge |
| Ende-zu-Ende | `scripts/smoke.mjs` gegen den gebauten Server | nur lokal, mit laufender Bridge |

## Testnähte in `src/connections.js`

Nur für Tests gedacht, der Produktionscode ruft sie nie auf:

- `setImapClientFactory(factory)`: Statt `createImapClient()` baut `withImapClient` seine Verbindungen mit `factory()`. Die bestehende Verbindung wird dabei verworfen. `null` stellt den echten Client wieder her.
- `setSmtpTransportFactory(factory)`: `sendMail()` nutzt den Transport aus `factory()`, ein Objekt mit `sendMail(options)` und `close()`. `null` stellt nodemailer wieder her.

Damit laufen die echte Verbindungs- und Retry-Logik und die echten Tool-Handler gegen Fakes.

## Fakes unter `test/helpers/`

| Datei | Zweck |
|---|---|
| `fake-mailbox.js` | Postfach mit mehreren Ordnern: `list`, `getMailboxLock` (fehlender Ordner → `NONEXISTENT`), `search` mit einem Auswerter für imapflow-Kriterien (`uid`, `or`, `header`, `cc`, `larger`, `answered`, …), `fetch`, `fetchOne` und schreibende Methoden (`messageMove`, `messageCopy`, `messageFlagsAdd/Remove`, `messageDelete`, `mailboxCreate`), die Ordner verändern und in `calls.writes` protokollieren |
| `fake-imap-client.js` | Verbindungsfabrik für `setImapClientFactory`: Jede Verbindung ist ein `fake-mailbox` über denselben Ordnern, dazu `connect`, `usable`, `append`, `logout`, `close`. Fehler werden je Methode vorgegeben (`state.failures.push({ method, error, disconnect, code })`); `disconnect` macht die Verbindung unbrauchbar wie ein abgerissener Socket. Alle Verbindungen und Aufrufe stehen in `state` |
| `fake-imap.js` | Eine einzelne Nachricht mit BODYSTRUCTURE aus echtem MIME, für die Tests des teilweisen Downloads |
| `office-fixtures.js` | Kleine Office- und ODF-Dateien, zur Testzeit mit `fflate` gebaut |

Handler werden getestet, indem `registerMailboxTools`/`registerComposeTools`/`registerLabelTools` auf einem Stub-Server registriert werden, der die Handler einsammelt (`{ registerTool: (name, config, handler) => … }`).

## Was die Handler-Tests absichern (`test/connections.test.js`)

- Ein lesender Vorgang wird nach einem Verbindungsfehler genau einmal auf einer neuen Verbindung wiederholt.
- Ein lesender Vorgang mit einem anderen Fehler wird nicht wiederholt.
- Ein schreibender Vorgang (`move_email`) wird nach einem Verbindungsfehler **nicht** wiederholt, es gibt keine zweite Verbindung.
- `update_draft` legt den neuen Entwurf an, bevor es den alten löscht, und warnt, wenn das Löschen scheitert.
- `send_draft` meldet Erfolg mit Warnung, wenn das Aufräumen scheitert, und sendet genau einmal. Ein gescheiterter Versand wird nicht wiederholt, und der Entwurf bleibt.
- Ordnerauflösung pro Verbindung: Ein umbenannter Papierkorb wird nach einem Reconnect gefunden. Auf derselben Verbindung scheitert der Schreibvorgang, und der nächste Aufruf löst neu auf. Ein Lesevorgang auf einen umbenannten Entwurfsordner wird einmal wiederholt.

Die Fakes bilden imapflow nur so weit nach, wie unsere Logik es braucht. Die Tests prüfen Wiederholungen, Reihenfolgen und Ergebnisse, nicht das Verhalten der Bridge. Das prüft `scripts/smoke.mjs`.

## Smoke-Test gegen die Bridge

`npm run build`, dann:

- `node scripts/smoke.mjs`: nur lesend. Gibt außerdem die gemeldete Server-Version neben der aus `package.json` aus.
- `--drafts`: legt Entwürfe an dich selbst an (neu, Antwort, Weiterleitung), ändert und löscht sie.
- `--labels`: legt ein Test-Label an, setzt es an einen Entwurf, entfernt es und räumt auf.

Es wird nie gesendet.

## CI (`.github/workflows/ci.yml`)

Bei jedem Push auf `main` und bei Pull Requests: Matrix Node 20 und 22, jeweils `npm ci`, `npm test`, `npm run build`. Ohne Geheimnisse, ohne Bridge.

## Server-Version

`src/version.js` liefert die an MCP-Clients gemeldete Version. Der Build (`build.mjs`) setzt `__PKG_VERSION__` per esbuild-`define` aus `package.json`. Beim Lauf aus `src/` (Tests) wird `package.json` direkt gelesen. `test/version.test.js` prüft die Übereinstimmung. Am 2026-10-03 meldete ein Build mit vorübergehend auf 1.2.0 gesetzter Version beim `initialize` ebenfalls 1.2.0.

---

## English

# Tests, fake clients and CI

**Files:** test/*.test.js, test/helpers/, src/connections.js (`setImapClientFactory`, `setSmtpTransportFactory`), .github/workflows/ci.yml, scripts/smoke.mjs

## Overview

| Level | Tool | Runs where |
|---|---|---|
| Unit and handler tests | `node:test` (`npm test`) | locally and in CI, without a Bridge |
| End to end | `scripts/smoke.mjs` against the built server | locally only, with a running Bridge |

## Test seams in `src/connections.js`

Meant for tests only; production code never calls them:

- `setImapClientFactory(factory)`: instead of `createImapClient()`, `withImapClient` builds its connections with `factory()`. The existing connection is dropped. `null` restores the real client.
- `setSmtpTransportFactory(factory)`: `sendMail()` uses the transport from `factory()`, an object with `sendMail(options)` and `close()`. `null` restores nodemailer.

This lets the real connection and retry logic and the real tool handlers run against fakes.

## Fakes under `test/helpers/`

| File | Purpose |
|---|---|
| `fake-mailbox.js` | Mailbox with several folders: `list`, `getMailboxLock` (missing folder → `NONEXISTENT`), `search` with an evaluator for imapflow criteria (`uid`, `or`, `header`, `cc`, `larger`, `answered`, …), `fetch`, `fetchOne` and write methods (`messageMove`, `messageCopy`, `messageFlagsAdd/Remove`, `messageDelete`, `mailboxCreate`) that change the folders and record themselves in `calls.writes` |
| `fake-imap-client.js` | Connection factory for `setImapClientFactory`: each connection is a `fake-mailbox` over the same folders, plus `connect`, `usable`, `append`, `logout`, `close`. Failures are scripted per method (`state.failures.push({ method, error, disconnect, code })`); `disconnect` makes the connection unusable like a dropped socket. All connections and calls are recorded in `state` |
| `fake-imap.js` | A single message with BODYSTRUCTURE built from real MIME, for the partial-download tests |
| `office-fixtures.js` | Small Office and ODF files, built at test time with `fflate` |

Handlers are tested by registering `registerMailboxTools`/`registerComposeTools`/`registerLabelTools` on a stub server that collects the handlers (`{ registerTool: (name, config, handler) => … }`).

## What the handler tests guarantee (`test/connections.test.js`)

- A read is retried exactly once on a new connection after a connection error.
- A read with a different error is not retried.
- A write (`move_email`) is **not** retried after a connection error, and there is no second connection.
- `update_draft` creates the new draft before deleting the old one and warns if the delete fails.
- `send_draft` reports success with a warning if the cleanup fails, and sends exactly once. A failed send is not retried, and the draft stays.
- Folder resolution per connection: a renamed Trash is found after a reconnect. On the same connection the write fails, and the next call resolves anew. A read on a renamed Drafts folder is retried once.

The fakes model imapflow only as far as our logic needs. The tests check retries, ordering and results, not the Bridge's behavior. That is what `scripts/smoke.mjs` checks.

## Smoke test against the Bridge

`npm run build`, then:

- `node scripts/smoke.mjs`: read-only. It also prints the reported server version next to the one from `package.json`.
- `--drafts`: creates drafts to yourself (new, reply, forward), changes and deletes them.
- `--labels`: creates a test label, puts it on a draft, removes it and cleans up.

Nothing is ever sent.

## CI (`.github/workflows/ci.yml`)

On every push to `main` and on pull requests: matrix Node 20 and 22, each running `npm ci`, `npm test`, `npm run build`. No secrets, no Bridge.

## Server version

`src/version.js` provides the version reported to MCP clients. The build (`build.mjs`) sets `__PKG_VERSION__` from `package.json` via esbuild `define`. When running from `src/` (tests), `package.json` is read directly. `test/version.test.js` checks that they match. On 2026-10-03 a build with the version temporarily set to 1.2.0 also reported 1.2.0 at `initialize`.
