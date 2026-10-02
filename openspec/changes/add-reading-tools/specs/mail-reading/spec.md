# Spec Delta

## ADDED Requirements

### Requirement: Additional search criteria
`search_emails` SHALL additionally accept `cc` (Cc address or name contains), `larger` and `smaller` (size in bytes), `answered` (true: only replied messages, false: only unreplied) and `hasAttachments` (true: only messages with at least one part with disposition `attachment`, false: only messages without). They SHALL be combined with all other criteria using AND. `hasAttachments` SHALL use the same definition as the `hasAttachments` field of message summaries, and `totalMatches` SHALL count only messages that pass it.

#### Scenario: Unanswered mails with attachments
- **WHEN** `search_emails` is called with `answered: false` and `hasAttachments: true`
- **THEN** only messages that were not replied to and have attachments are returned, newest first

#### Scenario: Large mails
- **WHEN** `search_emails` is called with `larger: 10000000` on "All Mail"
- **THEN** only messages larger than 10 MB are returned

#### Scenario: Inline images only
- **WHEN** a message contains only inline images and no attachment part
- **THEN** it does not match `hasAttachments: true`
