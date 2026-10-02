# Spec Delta

## Purpose

Lets an agent send new messages and replies immediately through the Bridge, with correct recipients, subject, threading headers and quoted original.

## ADDED Requirements

### Requirement: Send a new email
`send_email` SHALL send a message with `to`, `subject` and plain text `body`, optionally `html`, `cc`, `bcc` (comma-separated) and `attachments` (absolute local file paths). The sender SHALL be the configured from address. The result SHALL contain `success`, `messageId`, `to` and `subject`. Proton stores the sent message in Sent.

#### Scenario: Missing attachment file
- **WHEN** an attachment path does not exist
- **THEN** an error names the missing file and nothing is sent

### Requirement: Reply recipients
A reply SHALL be addressed to the original's Reply-To, or From if there is no Reply-To. The user's own addresses SHALL never be recipients. If the original was sent by the user, the reply SHALL go to the original To recipients. With `replyAll`, the other original To and Cc recipients SHALL be added as Cc, deduplicated case-insensitively and without addresses already in To.

#### Scenario: Reply-To honored
- **WHEN** the original has `Reply-To: list@example.com`
- **THEN** the reply goes to `list@example.com`

#### Scenario: Reply to own sent message
- **WHEN** the user replies to a message they sent to Bob
- **THEN** the reply goes to Bob

#### Scenario: Reply all excludes self
- **WHEN** replying to all on a message whose Cc contains one of the user's aliases
- **THEN** the alias is not among the recipients

### Requirement: Reply subject and threading
A reply's subject SHALL be prefixed with `Re: ` unless it already starts with `Re:`, `AW:` or `Antw:` (case-insensitive). `In-Reply-To` SHALL be the original Message-ID and `References` the original references followed by its Message-ID.

#### Scenario: German prefix kept
- **WHEN** the original subject is `AW: Angebot`
- **THEN** the reply subject stays `AW: Angebot`

### Requirement: Quoted original
With `quoteOriginal` (default true) the reply SHALL append the original's readable body below the new text, each line prefixed with `> `, preceded by the attribution `Am <date> schrieb <sender>:` (German medium date and short time in Europe/Berlin). If `html` is given, the HTML reply SHALL contain the original HTML (or the escaped text) in a Proton-style blockquote.

#### Scenario: Plain text reply
- **WHEN** `reply_to_email` is called with only `body`
- **THEN** the sent text is the body, a blank line, the attribution and the `> `-quoted original

### Requirement: Reply and send
`reply_to_email` SHALL send a reply to the message with `uid` in `folder` (default `INBOX`) using the rules above and SHALL fail without sending when no recipient can be determined. The result SHALL contain `messageId`, `to`, `cc` and `subject`.

#### Scenario: No recipient
- **WHEN** the original's only sender and recipients are the user's own addresses
- **THEN** an error says no recipient could be determined and nothing is sent
