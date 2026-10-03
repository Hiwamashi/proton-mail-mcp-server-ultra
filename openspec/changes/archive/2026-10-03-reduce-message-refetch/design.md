# Design

## Context

`fetchParsed` (`src/connections.js`) fetches `source` with `fetchOne` and runs `simpleParser` on the whole message. It is used by `read_email`, `get_attachment`, `update_draft`, `send_draft`, `delete_draft` and reply loading. Attachment indexes are positions in mailparser's `parsed.attachments`. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- One message loader used by every tool, with a cache and an optional part-wise path.
- Identical attachment numbering in both paths.

**Non-Goals:**
- Persistent (on-disk) cache – mail content must not be written to disk implicitly.
- Caching list or search results – they change constantly.
- Image downscaling (would need a native dependency such as `sharp`).

## Decisions

### Two steps, cache first
Step 1 (cache) is low risk and covers the common "read, then open attachments" flow. Step 2 (partial download) only applies above the size threshold and is where the complexity lives. Both are in this change but implemented and tested in that order, so step 1 can ship alone if step 2 takes longer.

### Cache design
- LRU map keyed `folder|uidValidity|uid`, value = `{ parsed, source?, bytes, expires }`. `uidValidity` comes from `client.mailbox.uidValidity` while the folder is locked.
- Byte accounting uses the message size; entries larger than half the budget are not cached.
- Flags are fetched with a separate `FETCH (FLAGS)` on every call – cheap compared to the body.
- Invalidation hooks: `move_email`, `delete_email`, `delete_draft`, `update_draft` (old UID), `send_draft`.
- Alternative: cache only the raw source and re-parse – rejected, parsing is a large part of the cost for big messages.

### Partial download via BODYSTRUCTURE
- Fetch `bodyStructure`, `envelope`, `headers` and `size`. If `size` > threshold, walk the structure:
  - Body: pick the `text/plain` and `text/html` parts that mailparser would use (first of each outside attachments, preferring `multipart/alternative` children) and `client.download(uid, part)` them; imapflow decodes transfer encoding and charset.
  - Attachments: produce the list in **mailparser's order and with mailparser's rules** (non-body leaves, `related` for parts inside `multipart/related` with a Content-ID, `message/rfc822` as one attachment).
- `get_attachment` maps the index to the part number and downloads only that part.
- Fixture tests parse each fixture both ways and assert identical attachment lists (filename, type, size ±encoding overhead, inline flag) and body text. This test is the guard for the "Stable attachment indexes" requirement.
- `update_draft` and `send_draft` always need the full message (they rebuild it), so they use the full path; index stability is guaranteed by the shared numbering test.
- Alternative: renumber everything by BODYSTRUCTURE in both paths – rejected, it would change indexes for existing users and differ from what `update_draft` rebuilds.

### Configuration
`PROTON_MCP_CACHE_MAX_BYTES` (64 MB), `PROTON_MCP_CACHE_TTL_MS` (10 min), `PROTON_MCP_PARTIAL_FETCH_BYTES` (5 MB), `PROTON_MCP_MAX_INLINE_IMAGE_BYTES` (1 MB).

## Risks / Trade-offs

- [Body chosen differently than mailparser in exotic structures] → Fall back to the full path when the structure contains unknown multipart types or encrypted parts (`multipart/encrypted`, `application/pkcs7-mime`); fixture tests for nested multiparts.
- [Memory growth] → Hard byte budget plus TTL; the cache is cleared on shutdown.
- [Stale content] → Not possible for the same UIDVALIDITY/UID (IMAP message content is immutable); only flags change, and they are fetched fresh.

## Migration Plan

No data migration. Rollback: `PROTON_MCP_CACHE_MAX_BYTES=0` and a very high `PROTON_MCP_PARTIAL_FETCH_BYTES` restore the old behavior.
