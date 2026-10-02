# drafts Specification

## Purpose
Lets an agent prepare messages as drafts in Proton Mail's Drafts folder, so a human can review, edit or send them, and lets the agent change, send or delete those drafts.

## Requirements

### Requirement: Create draft
`create_draft` SHALL store a message in the Drafts folder with the flags `\Draft` and `\Seen`, keeping a Bcc header, without sending it. It SHALL accept `to`, `subject`, `body`, `html`, `cc`, `bcc` and `attachments`. With `replyToUid` (and `replyFolder`, default `INBOX`) the draft SHALL be a reply following the reply rules of `mail-sending` (recipients, subject, threading, quote, `replyAll`, `quoteOriginal`); explicitly given `to`, `cc` or `subject` SHALL override the derived values. The result SHALL contain `draftUid`, `folder`, recipients, `subject`, `inReplyTo`, attachment names and a hint about `send_draft`/`update_draft`.

#### Scenario: Reply draft
- **WHEN** `create_draft` is called with `replyToUid` and a body
- **THEN** a draft addressed to the original sender with `Re:` subject, threading headers and quote appears in Proton under Drafts

#### Scenario: Server without UIDPLUS
- **WHEN** the server does not return the new UID on append
- **THEN** the draft UID is looked up by its Message-ID

### Requirement: List drafts
`list_drafts` SHALL return up to `limit` (1–100, default 20) newest drafts as message summaries, newest first, with the drafts folder and total count.

#### Scenario: No drafts
- **WHEN** the Drafts folder is empty
- **THEN** the result has `total: 0` and an empty list

### Requirement: Update draft
`update_draft` SHALL replace only the given fields of a draft (`to`, `cc`, `bcc`, `subject`, `body`, `html`); an empty string for `cc`, `bcc` or `html` SHALL remove them. Threading headers and attachments not removed via `removeAttachments` (indexes as listed by `read_email`) SHALL be kept; `addAttachments` SHALL add local files. A new `body` without `html` SHALL regenerate the HTML part from the text if the draft had HTML, dropping inline images that only the old HTML referenced. Signature parts SHALL be dropped. The new draft SHALL be saved before the old one is deleted; the result SHALL contain the new `draftUid` and `replacedUid`. If deleting the old draft fails, the result SHALL contain a warning instead of an error.

#### Scenario: Change subject only
- **WHEN** `update_draft` is called with only `subject`
- **THEN** recipients, body, attachments and threading are unchanged and the draft has a new UID

#### Scenario: Old draft cannot be deleted
- **WHEN** the new draft was saved but deleting the old UID fails
- **THEN** the result is successful and warns that the old draft must be deleted with `delete_draft`

### Requirement: Send draft
`send_draft` SHALL send a draft with its recipients, subject, text, HTML, threading headers and attachments (without signature parts) and then delete it from Drafts. A draft without recipients SHALL NOT be sent. If the send succeeds but deleting the draft fails, the result SHALL be successful with a warning not to send it again.

#### Scenario: Draft without recipients
- **WHEN** `send_draft` is called for a draft with no To, Cc or Bcc
- **THEN** an error says to add recipients with `update_draft` first

### Requirement: Delete draft
`delete_draft` SHALL permanently delete a draft by UID and return its subject.

#### Scenario: Delete
- **WHEN** `delete_draft` is called with an existing draft UID
- **THEN** the draft is gone from Drafts and the result names its subject
