# Proposal

## Why

Agents answering mail need context the server does not provide today: the conversation a message belongs to, searches by Cc, size, reply state or attachments, and the content of the most common business attachments – Word, Excel, PowerPoint and calendar invitations – which are currently only saved to disk or returned as raw iCalendar text.

## What Changes

- New tool `get_thread`: returns the conversation of a message (ancestors and replies, across all folders) in chronological order, optionally with quote-stripped bodies within a character budget.
- `search_emails` gets the criteria `cc`, `larger`, `smaller`, `answered` and `hasAttachments`.
- `get_attachment` returns text for Office Open XML (`.docx`, `.xlsx`, `.pptx`) and OpenDocument (`.odt`, `.ods`, `.odp`) files, and a structured summary for iCalendar files and invitations (`.ics`, `text/calendar`), with the raw text still available.
- Not breaking: existing parameters and outputs stay; ICS output changes from raw text to summary plus raw text (raw available with `raw: true`).

## Capabilities

### New Capabilities
- `conversation-threads`: `get_thread` – reconstructing a conversation from Message-ID, In-Reply-To and References.

### Modified Capabilities
- `mail-reading`: ADDED requirement for the additional search criteria.
- `attachments`: ADDED requirements for office documents and calendar files.

## Impact

- Code: new `src/tools/thread.js` (or in `mailbox.js`), `src/tools/mailbox.js` (search), `src/attachments.js`, new `src/office.js`, new `src/ical.js`.
- Dependency: `fflate` (small, dependency-free ZIP reader) for Office/ODF containers.
- Builds on the message loader from `reduce-message-refetch`; implement after it.
- Mode: all additions are read-only and available in every mode (`harden-agent-safety`).
