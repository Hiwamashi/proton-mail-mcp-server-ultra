# Proposal

## Why

OpenSpec was introduced after the server already shipped 15 tools, so `openspec/specs/` is empty. Future changes (safety hardening, performance, new tools) need a written baseline of the current behavior to express their deltas against; without it every change would have to restate existing behavior as ADDED requirements.

## What Changes

- Capture the behavior of the server as it exists in commit `926eaaf` as specs, grouped into six capabilities.
- No code changes. No behavior changes. Archiving this change moves the specs to `openspec/specs/`.
- Not breaking: existing users are not affected.

## Capabilities

### New Capabilities
- `bridge-connection`: Configuration, credentials, connection reuse to the Proton Mail Bridge and the retry/no-duplicate rules for IMAP writes and SMTP sends.
- `mail-reading`: `list_folders`, `list_emails`, `search_emails`, `read_email` including readable body extraction, paging and quote stripping.
- `attachments`: `get_attachment` – rendering PDFs, images, text and embedded messages, saving other files locally.
- `mailbox-management`: `move_email`, `mark_email`, `delete_email`.
- `mail-sending`: `send_email`, `reply_to_email` and the reply rules (recipients, subject, threading, quote).
- `drafts`: `create_draft`, `list_drafts`, `update_draft`, `send_draft`, `delete_draft`.

### Modified Capabilities

None.

## Impact

- New files under `openspec/specs/` after archive.
- No impact on code, APIs, dependencies or users.
