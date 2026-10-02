# mail-reading Specification

## Purpose
Lets an agent find and read mail: list folders and messages, search, and get a readable, paged body of a single message without changing its read state.

## Requirements

### Requirement: List folders
`list_folders` SHALL return every folder with its `path`, `specialUse` (or `null`), total `messages` and `unread` count.

#### Scenario: Folder overview
- **WHEN** `list_folders` is called
- **THEN** the result contains one entry per folder including INBOX, Drafts, Sent, Trash and All Mail with their counts

### Requirement: Message summaries
Tools that list messages SHALL describe each message with `uid`, ISO `date`, `from`, `to`, `subject` (`(no subject)` if empty), `unread`, `flagged`, `hasAttachments` (true only for parts with disposition `attachment`) and `size`. Addresses SHALL be formatted as `Name <address>`; names containing `,;<>@"` SHALL be quoted so the value can be passed back as a recipient list.

#### Scenario: Name with comma
- **WHEN** a sender's display name is `Doe, John`
- **THEN** `from` reads `"Doe, John" <john@example.com>`

### Requirement: List newest emails
`list_emails` SHALL return the newest messages of a folder (default `INBOX`), `limit` 1–100 (default 20), skipping `offset` newest messages, sorted newest first. The result SHALL include `folder`, `total`, `offset`, `showing`, `nextOffset` (or `null` when no older messages remain) and `messages`.

#### Scenario: Paging back
- **WHEN** `list_emails` is called with `offset` equal to the previous `nextOffset`
- **THEN** the next older block of messages is returned

#### Scenario: Offset beyond folder size
- **WHEN** `offset` is greater than or equal to the number of messages
- **THEN** the result has `showing: 0` and an empty `messages` list

### Requirement: Search emails
`search_emails` SHALL search one folder (default `INBOX`) combining all given criteria with AND: `from`, `to`, `subject`, `body`, `text` (headers or body), `since` (on or after), `before`, `unseen`, `flagged`. Dates SHALL be given as `YYYY-MM-DD`; any other format SHALL be rejected with an error naming the parameter. Without criteria all messages match. Results SHALL be sorted by internal date, newest first, and paged with `limit` (1–100, default 20) and `offset`; the result SHALL include `totalMatches` and `nextOffset`.

#### Scenario: No match
- **WHEN** no message matches
- **THEN** the result is a text saying that no emails in the folder matched

#### Scenario: Search everything
- **WHEN** `search_emails` is called with `folder: "All Mail"`
- **THEN** messages from all folders are searched and sorted by date, even though their UIDs are not chronological

#### Scenario: Very many matches
- **WHEN** more than 3000 messages match
- **THEN** only the 3000 highest UIDs are sorted and the result contains a note asking to narrow the search

#### Scenario: Invalid date
- **WHEN** `since` is `01.02.2026`
- **THEN** an error says the `since` date is invalid and must use `YYYY-MM-DD`

### Requirement: Read email without side effects
`read_email` SHALL return a header block (UID, folder, flags, From, To, Cc, Bcc, Reply-To if different from From, Date, Subject, Message-ID, In-Reply-To), a numbered attachment list and the body. Reading SHALL NOT mark the message as read unless `markAsRead: true` is given. In `read-only` mode `markAsRead: true` SHALL be refused with an error and the message SHALL NOT be returned marked.

#### Scenario: Default read
- **WHEN** an unread message is read without `markAsRead`
- **THEN** it stays unread

#### Scenario: Mark while reading
- **WHEN** `markAsRead: true` is given in `drafts` or `full` mode
- **THEN** the message is marked as read and the returned flags include `\Seen`

#### Scenario: Mark while reading in read-only mode
- **WHEN** `markAsRead: true` is given in `read-only` mode
- **THEN** an error says that marking is not available in `read-only` mode and the message stays unread

### Requirement: Readable body selection
`read_email` SHALL choose the body by `format`: `auto` (default) uses the text part and falls back to HTML converted to text when there is no text part, when `includeLinks` is set, or when more than 15 % of the text part consists of URLs; `text` uses only the text part; `html` always converts HTML to text; `raw_html` returns the original HTML. HTML conversion SHALL drop images, styles, scripts and the head, keep headings and tables, and show link URLs as `<url>` only with `includeLinks: true`. Invisible padding characters SHALL be removed and runs of blank lines collapsed. The header SHALL state the body source (`text`, `html`, `raw_html` or `none`).

#### Scenario: HTML-only newsletter
- **WHEN** a message has only an HTML part
- **THEN** the body is readable text converted from the HTML and the source is `html`

#### Scenario: URL-heavy text part
- **WHEN** the text part of a message is mostly tracking URLs and an HTML part exists
- **THEN** the body is taken from the HTML part

### Requirement: Paged bodies
The body SHALL be returned in chunks of at most `maxChars` (500–100000, default 20000) starting at `offset`. A chunk SHALL prefer to end at a line break in its last 20 % and SHALL NOT split a surrogate pair. The header SHALL state the character range, the total and, if more remains, the `offset` to continue with.

#### Scenario: Long message
- **WHEN** a body has 50000 characters and `maxChars` is 20000
- **THEN** the first call returns about 20000 characters and tells the agent which `offset` to use next

### Requirement: Strip quoted history
With `stripQuoted: true`, `read_email` SHALL remove the quoted reply history: from the first line matching a reply header in German, English, French, Spanish or Italian ("Am … schrieb …:", "On … wrote:", …), an "Original Message"/"Forwarded message" separator, an underscore separator or an Outlook header block (a "Von:"/"From:" line followed within five lines by both a "Gesendet:"/"Sent:"/"Datum:"/"Date:" line and a "Betreff:"/"Subject:"/"An:"/"To:" line), or a trailing block of `>`-quoted lines. The header SHALL say that quoted history was removed. If removing would leave nothing, the body SHALL stay unchanged.

#### Scenario: Reply with quote
- **WHEN** a body contains new text followed by "On Mon, 1 Jan 2026, Alice wrote:" and quoted lines
- **THEN** only the new text is returned
