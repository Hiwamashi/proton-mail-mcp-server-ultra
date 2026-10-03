# mail-sending Specification

## Purpose
Lets an agent send new messages and replies immediately through the Bridge, with correct recipients, subject, threading headers and quoted original.

## Requirements

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
With `quoteOriginal` (default true) the reply SHALL append the original's readable body below the new text, each line prefixed with `> `, preceded by an attribution line in the language of `PROTON_MCP_LOCALE` (`de` default: `Am <date> schrieb <sender>:`; `en`: `On <date>, <sender> wrote:`; `fr`: `Le <date>, <sender> a écrit :`; `es`: `El <date>, <sender> escribió:`; `it`: `Il <date>, <sender> ha scritto:`). The date SHALL use the locale's medium date and short time in the time zone `PROTON_MCP_TIMEZONE` (default `Europe/Berlin`). An unknown locale or time zone SHALL stop the server at startup with an error. Every attribution format SHALL be recognized by quote stripping. If `html` is given, the HTML reply SHALL contain the original HTML (or the escaped text) in a Proton-style blockquote.

#### Scenario: Plain text reply
- **WHEN** `reply_to_email` is called with only `body` and default settings
- **THEN** the sent text is the body, a blank line, the German attribution and the `> `-quoted original

#### Scenario: English attribution
- **WHEN** `PROTON_MCP_LOCALE=en` and `PROTON_MCP_TIMEZONE=America/New_York`
- **THEN** the attribution reads `On <date in New York time>, <sender> wrote:`

#### Scenario: Round trip with quote stripping
- **WHEN** a reply created with any supported locale is read with `stripQuoted: true`
- **THEN** only the new text is returned

#### Scenario: Invalid time zone
- **WHEN** `PROTON_MCP_TIMEZONE=Mars/Olympus`
- **THEN** the server exits at startup with an error naming the variable

### Requirement: Reply and send
`reply_to_email` SHALL send a reply to the message with `uid` in `folder` (default `INBOX`) using the rules above and SHALL fail without sending when no recipient can be determined. The result SHALL contain `messageId`, `to`, `cc` and `subject`.

#### Scenario: No recipient
- **WHEN** the original's only sender and recipients are the user's own addresses
- **THEN** an error says no recipient could be determined and nothing is sent

### Requirement: Forward an email
`forward_email` SHALL send the message with `uid` in `folder` (default `INBOX`) to `to` (required), `cc` and `bcc`, with an optional introductory `body` (and `html`). The subject SHALL be prefixed with `Fwd: ` unless it already starts with `Fwd:`, `Fw:` or `WG:` (case-insensitive). Below the introduction the message SHALL contain a forwarded-message header block (separator line, From, Date, Subject, To, Cc of the original) and the original's readable body; the HTML version SHALL contain the original HTML. With `includeAttachments` (default true) the original attachments, including inline images, SHALL be attached; signature parts SHALL be dropped. No `In-Reply-To` SHALL be set. `forward_email` SHALL only be available in `full` mode.

#### Scenario: Forward an invoice
- **WHEN** `forward_email` forwards a message with a PDF to `buchhaltung@example.com`
- **THEN** the recipient gets `Fwd: <subject>` with the header block, the original text and the PDF

#### Scenario: Without attachments
- **WHEN** `includeAttachments: false`
- **THEN** the forwarded message has no attachments

#### Scenario: Not in drafts mode
- **WHEN** the mode is `drafts`
- **THEN** `forward_email` is not listed
