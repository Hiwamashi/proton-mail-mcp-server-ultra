# Spec Delta

## ADDED Requirements

### Requirement: Single download per message
Within the cache lifetime (`PROTON_MCP_CACHE_TTL_MS`, default 600000) and size (`PROTON_MCP_CACHE_MAX_BYTES`, default 67108864), reading a message and then opening its attachments SHALL NOT download the message again. Cache entries SHALL be keyed by folder, UIDVALIDITY and UID, so a reused UID after a folder reset never returns another message. Entries for a message SHALL be dropped when the server moves, deletes or replaces it. `PROTON_MCP_CACHE_MAX_BYTES=0` SHALL disable the cache.

#### Scenario: Read then open attachments
- **WHEN** `read_email` is called for a message and then `get_attachment` for indexes 0, 1 and 2
- **THEN** the message source is downloaded at most once

#### Scenario: Message moved
- **WHEN** a cached message is moved with `move_email`
- **THEN** a later `read_email` with the old UID in the old folder returns a not-found error

### Requirement: Current flags
Flags returned by `read_email` SHALL always reflect the server state at the time of the call, even when the message content comes from the cache.

#### Scenario: Read in Proton between two calls
- **WHEN** a message is read via `read_email`, then marked as read in Proton Mail, then read again via `read_email`
- **THEN** the second result shows `\Seen`

### Requirement: Partial download of large messages
For messages larger than `PROTON_MCP_PARTIAL_FETCH_BYTES` (default 5242880), `read_email` SHALL download only the headers and the text and HTML body parts, and `get_attachment` SHALL download only the requested attachment part. The output SHALL be the same as for a full download.

#### Scenario: Large mail with scans
- **WHEN** `read_email` is called for a 30 MB message with three scanned PDFs
- **THEN** the body is returned without downloading the PDF parts

### Requirement: Stable attachment indexes
For any message, the attachment index shown by `read_email` SHALL address the same attachment in `get_attachment` and in `update_draft` (`removeAttachments`), regardless of message size, cache state or download method.

#### Scenario: Large draft
- **WHEN** a draft larger than the partial-download threshold is read and `update_draft` removes index 1
- **THEN** the attachment that `read_email` listed as index 1 is removed
