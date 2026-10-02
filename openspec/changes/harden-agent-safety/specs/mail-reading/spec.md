# Spec Delta

## MODIFIED Requirements

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
