# Spec Delta

## MODIFIED Requirements

### Requirement: List newest emails
`list_emails` SHALL return the messages most recently added to a folder (default `INBOX`), `limit` 1–100 (default 20), skipping `offset` most recently added messages, each page sorted by date newest first. The tool description SHALL state that the order follows arrival in the folder and that `search_emails` (for example with `since`) gives date order across the folder, which matters in "All Mail" and after moving old messages. The result SHALL include `folder`, `total`, `offset`, `showing`, `nextOffset` (or `null` when no older messages remain) and `messages`.

#### Scenario: Paging back
- **WHEN** `list_emails` is called with `offset` equal to the previous `nextOffset`
- **THEN** the next block of earlier added messages is returned

#### Scenario: Offset beyond folder size
- **WHEN** `offset` is greater than or equal to the number of messages
- **THEN** the result has `showing: 0` and an empty `messages` list

#### Scenario: Old message moved into the inbox
- **WHEN** a message from 2020 was just moved into INBOX
- **THEN** it appears on the first page of `list_emails`
