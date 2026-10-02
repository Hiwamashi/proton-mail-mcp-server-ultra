# Tasks

## 1. Configuration

- [ ] 1.1 Add `mode` (`read-only` | `drafts` | `full`, default `drafts`) and `attachmentRoots` to `src/config.js`; exit with an error for unknown modes and verify with a unit test for parsing and defaults
- [ ] 1.2 Print the active mode and attachment roots to stderr at startup and verify by starting `dist/server.mjs` with each mode

## 2. Mode enforcement

- [ ] 2.1 Extend `defineTool` with a `modes` field and assign modes to all 15 tools; verify with a test that lists registered tools per mode against the spec table
- [ ] 2.2 Refuse permanent deletion from Trash outside `full` mode in `delete_email`; verify with a handler test using a fake IMAP client
- [ ] 2.3 Refuse `markAsRead` in `read-only` mode; verify with a handler test
- [ ] 2.4 Make tool descriptions and the draft hint mode-dependent (`create_draft`, `update_draft`, `reply_to_email` references); verify that no description in `drafts` mode mentions an unregistered tool

## 3. Attachment path check

- [ ] 3.1 Implement `assertAttachable` in `src/safety.js` (absolute, realpath, regular file, roots, hidden segments, `*`); verify with tests for Documents file, `~/.ssh` key, `..` traversal, symlink escape, directory path and `*`
- [ ] 3.2 Use it in `fileAttachments` for `send_email`, `reply_to_email`, `create_draft` and `update_draft`; verify that a refused path creates no draft

## 4. Annotations and instructions

- [ ] 4.1 Add `title` and annotations to every tool; verify with a test that every registered tool declares `title`, `readOnlyHint` and `openWorldHint`
- [ ] 4.2 Pass `instructions` (untrusted content + active mode) to `McpServer`; verify via `scripts/smoke.mjs` that the initialize result contains them

## 5. Documentation

- [ ] 5.1 Add `feature-documentation/safety/operating-modes.md` and `feature-documentation/safety/attachment-roots.md` (DE+EN) and update the affected tool docs
- [ ] 5.2 Update README (DE+EN): new variables, mode table, breaking-change migration note
- [ ] 5.3 Update PROGRESS.md and verify `npm test` and `npm run build` pass
