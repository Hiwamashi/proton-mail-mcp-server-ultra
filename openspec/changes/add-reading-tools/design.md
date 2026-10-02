# Design

## Context

Searches run per folder with imapflow `search` and sort by internal date (`src/tools/mailbox.js`). Proton's own conversation grouping is not exposed over IMAP, so threads have to be rebuilt from headers. `get_attachment` dispatches by MIME type in `src/attachments.js`; unknown types are saved. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Threads that include the user's own sent replies.
- Office/ODF text extraction without heavy dependencies.

**Non-Goals:**
- Writing calendar replies (accept/decline) – a separate change if needed.
- Full spreadsheet fidelity (formulas, formatting, merged cells).
- Legacy binary Office formats.

## Decisions

### Threads via header search in "All Mail"
Breadth-first: start with the start message's Message-ID, References and In-Reply-To. Per round, one `UID SEARCH OR HEADER Message-ID x OR HEADER References x …` batch in "All Mail" (resolved via special-use `\All`, fallback "All Mail"), then add the new messages' IDs. Stop at 100 messages or after 10 rounds. Folder membership comes from a `HEADER Message-ID` search in the folders the user sees most (INBOX, Sent, Archive) only when cheap; otherwise the field is omitted.
- Spike first: verify Proton Bridge supports `SEARCH HEADER` for `Message-ID`, `References` and `In-Reply-To`. If not, fall back to subject-based candidate search (normalized subject without `Re:/AW:/Fwd:`) in a date window and filter by headers locally.
- Alternative: JWZ threading over the whole mailbox – rejected, requires fetching headers of every message.

### Search criteria
`cc`, `larger`, `smaller` and `answered` map directly to IMAP SEARCH. `hasAttachments` cannot be searched in IMAP; the existing candidate step already fetches `internalDate` for up to 3000 UIDs and will additionally fetch `bodyStructure` when `hasAttachments` is set, filtering with the existing `hasAttachments()` helper before sorting and paging.

### Office extraction with `fflate`
`fflate` (≈ 30 KB, no dependencies) unzips; the XML parts are read with small purpose-built extractors:
- DOCX: `word/document.xml` – `w:p` → lines, `w:tab`, `w:br`, tables → tab-separated cells.
- PPTX: `ppt/slides/slideN.xml` in numeric order – `a:p` text.
- XLSX: `xl/sharedStrings.xml`, `xl/workbook.xml` (sheet names), `xl/worksheets/sheetN.xml` – cell values (shared strings, inline strings, numbers; no formulas).
- ODF: `content.xml` – `text:p`, `text:h`, `table:table-row`/`table:table-cell`.
A ZIP bomb guard limits total uncompressed size (50 MB) and entries. Alternative: `mammoth` + `xlsx` (SheetJS) – rejected for bundle size and SheetJS' npm distribution issues.

### iCalendar parser
Own minimal parser: line unfolding, parameters, `VEVENT`/`VTIMEZONE`, value unescaping. Times are shown as in the file with their TZID, plus UTC for floating-free values. Alternative: `node-ical` – rejected (pulls `moment-timezone`, large).

## Risks / Trade-offs

- [Bridge does not support HEADER search] → Spike task first; subject-based fallback.
- [Thread search cost on huge mailboxes] → Round and message limits; `includeBodies` uses the message loader and its cache.
- [Malformed OOXML] → Catch and fall back to saving with a clear message.
- [ICS output change surprises existing users] → Raw text stays included below the summary; `raw: true` restores the old output.

## Open Questions

- Whether folder membership per thread message is worth the extra searches – decide after the spike based on measured timings; the field is optional in the spec.
