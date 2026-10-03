# Design

## Context

Single-UID operations live in `src/tools/mailbox.js`; reply composition in `src/compose.js` and `composeOptions` in `src/tools/compose.js`; `carryAttachments` already rebuilds attachments of a parsed message for drafts. Proton Bridge exposes labels as folders under `Labels/` and user folders under `Folders/`. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Forwarding that reuses the existing compose and attachment code paths.
- Bulk operations with honest reporting of missing UIDs.
- Label semantics matching what users see in Proton Mail.

**Non-Goals:**
- Forwarding as `message/rfc822` attachment ("forward as attachment") – can be added as an option later.
- Renaming or deleting folders/labels (destructive, rarely needed by agents).
- Bulk operations across different folders in one call.

## Decisions

### Forward composition
`composeOptions` gets a `forward` input next to `original`: subject via a new `forwardSubject()`, body = intro + header block + `extractBody(original)`, HTML = intro HTML + header block HTML + original HTML. Attachments via `carryAttachments(original)` (keeps inline `cid` images, drops signatures). Header block text follows the quote language (German now; locale-aware once `improve-robustness-and-locale` lands).

### Bulk: existence check first
`UID SEARCH UID <set>` in the selected folder yields the existing UIDs; missing ones go into `notFound`; then one `UID MOVE/STORE/…` over the existing set. Not retried (write), consistent with `bridge-connection`. The single-UID path is the same code with a one-element set, keeping its old result fields.

### Labels via COPY and label-folder expunge
- Add: `UID COPY <set> "Labels/X"` from the source folder. In Bridge, a copy into a label folder applies the label; it does not duplicate the message.
- Remove: Message UIDs differ per folder, so look up the messages in `Labels/X` by Message-ID (`SEARCH HEADER Message-ID`), then `STORE \Deleted` + `UID EXPUNGE` in `Labels/X`. In Bridge, expunging from a label folder removes only the label.
- Spike first: verify both behaviors against the running Bridge with a test message before implementing; if Bridge semantics differ, stop and revise the spec.
- Alternative: IMAP keywords – rejected, Bridge does not map labels to keywords.

### Spike result (2026-10-03, Proton Bridge, approved throwaway message and label)
A message `[MCP-Spike] Testnachricht` was appended to INBOX and a label `Labels/MCP-Spike-Test` created (`mailboxCreate` works, the label is listed right away). Counts by Message-ID per folder:

| Step | INBOX | Labels/MCP-Spike-Test |
|---|---|---|
| after APPEND | 1 | 0 |
| after `UID COPY` INBOX → label | 1 | 1 |
| after a second `UID COPY` (label already set) | 1 | 1 |
| after `STORE \Deleted` + `UID EXPUNGE` in the label folder | 1 | 0 |

- COPY into a label folder applies the label without removing the message from INBOX; a second COPY changes nothing (idempotent).
- EXPUNGE in the label folder removes only the label; the message stays in INBOX with its flags (`\Seen`).
- The message is found in the label folder by `HEADER Message-ID` right after the COPY, so the remove path works as designed.
- No duplicate: after cleanup exactly one copy was left in "All Mail".
- "All Mail" lags behind: the appended message only appeared there after a few seconds, and after Move to Trash + EXPUNGE in Trash it was still listed in "All Mail" for some seconds before it disappeared (checked again after 30 s: gone). Label operations therefore never rely on "All Mail".
- Cleanup: test message moved to Trash and expunged there, label removed with `mailboxDelete`.
→ Design confirmed; no spec change needed.

### create_folder
`client.mailboxCreate("Folders/<name>" | "Labels/<name>")`; existence checked via `list()` first. Clears the special-use/folder cache.

## Risks / Trade-offs

- [Bridge expunge in a label folder deletes the message instead of the label] → Spike with a throwaway message before anything else; the remove path is only built after the spike confirms the behavior.
- [Large forwarded attachments exceed Proton's size limit] → SMTP error is returned as is; `includeAttachments: false` documented as workaround.
- [Bulk delete of many messages by a manipulated agent] → Trash only in `drafts` mode (from `harden-agent-safety`); limit 500 per call.
