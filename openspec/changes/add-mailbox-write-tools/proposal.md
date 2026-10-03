# Proposal

## Why

Common mailbox chores are clumsy or impossible for agents today: forwarding a message needs a hand-built draft without the original attachments, "archive these 30 newsletters" takes 30 tool calls, and Proton's labels – a core organizing concept – cannot be set or removed at all.

## What Changes

- New tool `forward_email` (sends immediately, `full` mode only) and a `forwardUid` option for `create_draft` (available in `drafts` mode), both with forwarded header block, original body and – by default – the original attachments.
- `move_email`, `mark_email` and `delete_email` accept `uids` (up to 500) in addition to `uid` and report which UIDs were not found.
- New tool `label_email` to add or remove Proton labels on one or more messages, and `create_folder` to create a folder (`Folders/…`) or label (`Labels/…`).
- Not breaking: `uid` keeps working; results for single-UID calls keep their fields.

## Capabilities

### New Capabilities
- `labels`: Adding and removing Proton labels and creating folders and labels.

### Modified Capabilities
- `mail-sending`: ADDED requirement for forwarding.
- `drafts`: ADDED requirement for forward drafts.
- `mailbox-management`: ADDED requirement for bulk operations; MODIFIED "Move email" (not-found message) and "Mark email" (unknown UID now fails instead of reporting success).
- `agent-safety`: MODIFIED "Operating modes" – `label_email` and `create_folder` join `drafts`, `forward_email` joins `full`.

## Impact

- Code: `src/compose.js` (forward header, subject), `src/tools/compose.js`, `src/tools/mailbox.js`, new `src/tools/labels.js`.
- Depends on `harden-agent-safety` for mode registration (`forward_email` in `full`; `label_email`, `create_folder`, bulk operations in `drafts` and `full`). Implement after it.
- Forward header language follows the quote locale from `improve-robustness-and-locale` once that exists; until then German like the reply quote.
