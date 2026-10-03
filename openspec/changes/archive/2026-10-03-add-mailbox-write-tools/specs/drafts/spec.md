# Spec Delta

## ADDED Requirements

### Requirement: Forward draft
`create_draft` SHALL accept `forwardUid` and `forwardFolder` (default `INBOX`) and `includeAttachments` (default true) to create a draft that forwards that message, with the same subject, header block, body and attachment rules as `forward_email`. `to` MAY be empty for a forward draft. `replyToUid` and `forwardUid` SHALL NOT be combined; doing so SHALL fail with an error.

#### Scenario: Forward as draft
- **WHEN** `create_draft` is called with `forwardUid` and no `to`
- **THEN** a draft with `Fwd:` subject, the original content and attachments appears in Drafts for the user to address and send

#### Scenario: Reply and forward combined
- **WHEN** both `replyToUid` and `forwardUid` are given
- **THEN** an error says only one of them can be used
