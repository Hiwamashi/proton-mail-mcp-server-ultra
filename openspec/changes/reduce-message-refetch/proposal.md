# Proposal

## Why

`read_email` and every `get_attachment` call download and parse the complete message source. A 25 MB mail with three attachments is transferred four times to show 3 KB of text and three files, which makes agents slow on exactly the mails that matter (contracts, invoices, scans). In addition, images up to 5 MB are returned inline as base64, which many MCP clients reject or which fills the agent's context.

## What Changes

- Parsed messages are kept in a bounded in-memory cache, so `read_email` followed by `get_attachment` downloads a message once. Flags are always fetched fresh.
- Large messages (above a size threshold) are read part by part: `read_email` downloads only headers and text parts, `get_attachment` only the requested part. Attachment indexes stay identical across `read_email`, `get_attachment` and `update_draft`.
- The inline image limit becomes configurable (`PROTON_MCP_MAX_INLINE_IMAGE_BYTES`) with a lower default of 1 MB; larger images are saved and the path is returned.
- **BREAKING (minor)** Images between 1 MB and 5 MB are now saved instead of shown inline by default. Opt back with `PROTON_MCP_MAX_INLINE_IMAGE_BYTES=5242880`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `attachments`: "Render attachments by type" and "Save files that cannot be shown" – configurable inline image limit with 1 MB default.
- `mail-reading`: ADDED requirements for single download per message, current flags and stable attachment indexes.

## Impact

- Code: `src/connections.js` (`fetchParsed`), new `src/message-cache.js`, `src/tools/mailbox.js`, `src/tools/compose.js` (`update_draft`, `send_draft` use the same loader), `src/attachments.js`, `src/config.js`.
- Memory: bounded by the cache size (default 64 MB).
- Should be implemented before `add-reading-tools`, which reuses the loader for threads and new attachment types.
