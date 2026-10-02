# Spec Delta

## ADDED Requirements

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
