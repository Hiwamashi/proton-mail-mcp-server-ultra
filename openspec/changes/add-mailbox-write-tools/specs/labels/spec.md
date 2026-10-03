# Spec Delta

## Purpose

Lets an agent use Proton Mail's labels – which, unlike folders, can be combined on one message – and create new folders and labels for organizing mail.

## ADDED Requirements

### Requirement: Add and remove labels
`label_email` SHALL take `folder` (default `INBOX`), `uid` or `uids` (1–500), `label` (name or path, `Labels/` prefix optional) and `action` (`add` or `remove`). Adding SHALL put the label on the messages without removing them from their folder. Removing SHALL take the label off the messages without deleting or moving them. A label that does not exist SHALL fail with an error listing the existing labels. System folders that the Bridge lists under `Labels/` with a special use (for example Sent or Trash) SHALL NOT be treated as labels; naming one SHALL fail before anything is changed. A copy or removal the server does not confirm SHALL be reported as an error. When removing, labeled copies that share a Message-ID with the addressed message and cannot be told apart SHALL be left unchanged and reported. The result SHALL contain `label`, `action`, `processed` and `notFound`. Adding a label a message already has, or removing one it does not have, SHALL succeed without change.

#### Scenario: Add label
- **WHEN** `label_email` adds `Steuer` to a message in INBOX
- **THEN** the message has the label `Steuer` in Proton Mail and is still in INBOX

#### Scenario: Remove label
- **WHEN** `label_email` removes `Steuer` from that message
- **THEN** the label is gone and the message is still in INBOX and All Mail

#### Scenario: System folder named as label
- **WHEN** `label_email` removes the label `Gelöschte Elemente` and `Labels/Gelöschte Elemente` is the Trash folder
- **THEN** an error says it is a system folder and no message is changed

#### Scenario: Unknown label
- **WHEN** the label `Stuer` does not exist
- **THEN** an error lists the existing labels

### Requirement: Create folder or label
`create_folder` SHALL take `name` and `type` (`folder` or `label`) and create `Folders/<name>` or `Labels/<name>`; nested folder names with `/` SHALL be supported for folders. An existing path SHALL fail with an error. The result SHALL contain the created `path`. Renaming and deleting folders SHALL NOT be offered.

#### Scenario: New label
- **WHEN** `create_folder` is called with `name: "Projekt X"` and `type: "label"`
- **THEN** `Labels/Projekt X` exists and appears in `list_folders`

### Requirement: Label tools in modes
`label_email` and `create_folder` SHALL be available in `drafts` and `full` mode and SHALL NOT be available in `read-only` mode.

#### Scenario: Read-only
- **WHEN** the mode is `read-only`
- **THEN** neither `label_email` nor `create_folder` is listed
