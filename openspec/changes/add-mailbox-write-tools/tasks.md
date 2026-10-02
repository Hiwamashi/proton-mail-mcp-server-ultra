# Tasks

## 1. Spike

- [ ] 1.1 Verify against the running Bridge with a throwaway message: COPY into `Labels/X` adds a label without duplicating; STORE \Deleted + EXPUNGE in `Labels/X` removes only the label; record the results in design.md

## 2. Forwarding

- [ ] 2.1 Add `forwardSubject()` and the forwarded header block (text + HTML) to `src/compose.js`; verify with unit tests for `Fwd:`/`Fw:`/`WG:` prefixes and header content
- [ ] 2.2 Extend `composeOptions` with `forward` and attachment carry-over; verify with a MIME fixture that the built message contains the original PDF and inline image and no signature part
- [ ] 2.3 Register `forward_email` (`full` mode, `openWorldHint: true`) and add `forwardUid`/`forwardFolder`/`includeAttachments` to `create_draft` with the replyToUid conflict error; verify with handler tests

## 3. Bulk operations

- [ ] 3.1 Add `uid`/`uids` validation and the existence check to `move_email`, `mark_email`, `delete_email`; verify with handler tests for all-present, partly missing, none present and both-given
- [ ] 3.2 Verify single-UID results are unchanged with a regression test against the baseline output shape

## 4. Labels and folders

- [ ] 4.1 Implement `label_email` add/remove (Message-ID lookup in the label folder); verify with a fake client and with `scripts/smoke.mjs` using a self-addressed test message
- [ ] 4.2 Implement `create_folder` and cache invalidation; verify that the new path appears in `list_folders`
- [ ] 4.3 Assign modes and annotations (`destructiveHint` false for labels, true for bulk delete); verify with the mode registration test from `harden-agent-safety`

## 5. Documentation

- [ ] 5.1 Add `feature-documentation/compose/forward-email.md`, `mailbox/bulk-operations.md`, `labels/label-email.md`, `labels/create-folder.md` (DE+EN); update `create-draft.md` and the mailbox tool docs
- [ ] 5.2 Update README (DE+EN) tool table and PROGRESS.md; verify `npm test` and `npm run build` pass
