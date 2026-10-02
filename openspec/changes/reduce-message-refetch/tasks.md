# Tasks

## 1. Message loader and cache

- [x] 1.1 Add the four new settings to `src/config.js`; verify defaults with a unit test
- [x] 1.2 Implement `src/message-cache.js` (LRU by bytes, TTL, keys with UIDVALIDITY, invalidate, clear); verify with unit tests for eviction, expiry, oversize entries and disabled cache
- [x] 1.3 Introduce one `loadMessage(client, folder, uid)` used by all tools instead of `fetchParsed`, fetching flags separately; verify with a fake IMAP client that `read_email` + three `get_attachment` calls fetch the source once and flags every time
- [x] 1.4 Invalidate entries in `move_email`, `delete_email`, `delete_draft`, `update_draft` and `send_draft`; verify with handler tests

## 2. Partial download

- [x] 2.1 Implement body and attachment list from BODYSTRUCTURE following mailparser's numbering rules, with fallback to the full path for encrypted or unknown structures; verify with fixtures (nested multipart, related images, rfc822 attachment, HTML-only, signed mail) that both paths yield identical attachment lists and bodies
- [x] 2.2 Use the partial path in `read_email` and `get_attachment` above the threshold; verify with a fake client that attachment parts are not downloaded by `read_email`
- [x] 2.3 Measure with `scripts/smoke.mjs` against a large real message and record before/after timings in the PR description

## 3. Inline image limit

- [x] 3.1 Apply `PROTON_MCP_MAX_INLINE_IMAGE_BYTES` in `src/attachments.js` and add the "exceeds the inline limit" message; verify with fixtures for a 200 KB and a 3 MB image

## 4. Documentation

- [x] 4.1 Add `feature-documentation/reading/message-cache.md` (DE+EN) and update `read-email.md`, `get-attachment.md`, `configuration.md`
- [x] 4.2 Update README (DE+EN) settings table and the image limit note; update PROGRESS.md; verify `npm test` and `npm run build` pass
