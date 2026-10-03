# Tasks

## 1. Spike

- [x] 1.1 Check against the running Bridge whether `UID SEARCH HEADER Message-ID|References|In-Reply-To` works in "All Mail"; record the result and timings in design.md

## 2. get_thread

- [x] 2.1 Implement thread collection (breadth-first header search, limits, subject fallback if the spike failed); verify with a fake IMAP client for chain, own replies, single message and truncation at 100
- [x] 2.2 Add body budget handling (quote-stripped bodies, oldest shortened first); verify with a unit test for the budget logic
- [x] 2.3 Register `get_thread` (read-only annotations, all modes); verify with `scripts/smoke.mjs` on a real conversation

## 3. Search criteria

- [x] 3.1 Add `cc`, `larger`, `smaller`, `answered` to `search_emails`; verify the IMAP criteria mapping with a unit test
- [x] 3.2 Add `hasAttachments` filtering in the candidate step; verify `totalMatches` and paging with a fake client

## 4. Office and calendar attachments

- [x] 4.1 Add `fflate` and implement `src/office.js` for DOCX, PPTX, XLSX, ODT, ODS, ODP with size guard; verify with small fixture files for each format, an encrypted file and a ZIP bomb
- [x] 4.2 Implement `src/ical.js` and the summary output with `raw` option; verify with fixtures for REQUEST, CANCEL, all-day event and recurring event with VTIMEZONE
- [x] 4.3 Wire both into `attachmentToContent`; verify legacy `.doc` is still saved with the new message

## 5. Documentation

- [x] 5.1 Add `feature-documentation/reading/get-thread.md`, `reading/office-attachments.md`, `reading/calendar-attachments.md` (DE+EN); update `search-emails.md` and `get-attachment.md`
- [x] 5.2 Update README (DE+EN) tool table and PROGRESS.md; verify `npm test` and `npm run build` pass
