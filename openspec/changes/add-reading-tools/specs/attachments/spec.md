# Spec Delta

## ADDED Requirements

### Requirement: Office documents as text
`get_attachment` SHALL return the text of `.docx`, `.pptx`, `.odt` and `.odp` attachments (paragraphs, headings, lists, table cells; for presentations one block per slide with its number) and of `.xlsx` and `.ods` attachments (one block per sheet with its name, rows as tab-separated lines, cell values as displayed text without formulas). Text SHALL be paged like other text content. Encrypted or damaged files and legacy binary formats (`.doc`, `.xls`, `.ppt`) SHALL be saved to the attachment folder with a message saying they cannot be read.

#### Scenario: Word contract
- **WHEN** the attachment is a `.docx` contract
- **THEN** its text is returned including headings and table contents

#### Scenario: Excel list
- **WHEN** the attachment is an `.xlsx` with two sheets
- **THEN** both sheets are returned with their names and tab-separated rows

#### Scenario: Password-protected document
- **WHEN** a `.docx` is encrypted
- **THEN** it is saved and the response says it cannot be read

### Requirement: Calendar files summarized
For iCalendar attachments (`text/calendar`, `application/ics`, `.ics`), `get_attachment` SHALL return a summary per event: method (REQUEST, CANCEL, REPLY, …), summary, start and end with time zone, all-day flag, location, organizer, attendees with participation status, recurrence rule, and description; followed by the raw iCalendar text. With `raw: true` only the raw text SHALL be returned.

#### Scenario: Meeting invitation
- **WHEN** the attachment is an invitation with `METHOD:REQUEST`
- **THEN** the response lists method, title, start, end, organizer and attendees before the raw text

#### Scenario: Raw requested
- **WHEN** `get_attachment` is called with `raw: true` for an `.ics`
- **THEN** only the raw iCalendar text is returned
