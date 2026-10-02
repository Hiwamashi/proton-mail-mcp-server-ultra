# Spec Delta

## ADDED Requirements

### Requirement: Bulk operations
`move_email`, `mark_email` and `delete_email` SHALL accept either `uid` or `uids` (1–500 UIDs of the same folder); giving both or neither SHALL fail with an error. Each UID SHALL be handled as described for the single-UID operation, in one IMAP command per tool call. With `uids` the result SHALL contain `processed` (UIDs that existed), `notFound` (UIDs that did not exist in the folder) and, for moves, `uidMap` (old → new UID where reported). A call where no UID exists SHALL fail with an error. With `uid` the result SHALL keep its previous fields.

#### Scenario: Archive newsletters
- **WHEN** `move_email` is called with 30 `uids` from INBOX to Archive
- **THEN** all 30 are moved in one call and the result lists them in `processed` with their new UIDs

#### Scenario: Some UIDs missing
- **WHEN** `mark_email` is called with `uids: [10, 11, 999]` and 999 does not exist
- **THEN** 10 and 11 are marked and 999 is listed in `notFound`

#### Scenario: Both uid and uids
- **WHEN** `delete_email` is called with `uid` and `uids`
- **THEN** an error says to use exactly one of them
