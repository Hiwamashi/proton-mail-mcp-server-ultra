# Spec Delta

## MODIFIED Requirements

### Requirement: Create draft
`create_draft` SHALL store a message in the Drafts folder with the flags `\Draft` and `\Seen`, keeping a Bcc header, without sending it. It SHALL accept `to`, `subject`, `body`, `html`, `cc`, `bcc` and `attachments`. With `replyToUid` (and `replyFolder`, default `INBOX`) the draft SHALL be a reply following the reply rules of `mail-sending` (recipients, subject, threading, quote, `replyAll`, `quoteOriginal`); explicitly given `to`, `cc` or `subject` SHALL override the derived values. The result SHALL contain `draftUid`, `folder`, recipients, `subject`, `inReplyTo`, attachment names and a hint: in `full` mode it SHALL mention `send_draft` and `update_draft`; in `drafts` mode it SHALL mention `update_draft` and that the user reviews and sends the draft in Proton Mail.

#### Scenario: Reply draft
- **WHEN** `create_draft` is called with `replyToUid` and a body
- **THEN** a draft addressed to the original sender with `Re:` subject, threading headers and quote appears in Proton under Drafts

#### Scenario: Server without UIDPLUS
- **WHEN** the server does not return the new UID on append
- **THEN** the draft UID is looked up by its Message-ID

#### Scenario: Hint in drafts mode
- **WHEN** a draft is created in `drafts` mode
- **THEN** the hint does not mention `send_draft`
