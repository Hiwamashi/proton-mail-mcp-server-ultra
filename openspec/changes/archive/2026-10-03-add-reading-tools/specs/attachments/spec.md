# Spec Delta

## MODIFIED Requirements

### Requirement: Render attachments by type
`get_attachment` SHALL return, after a header line with index, name, type, size and UID:
- PNG, JPEG, GIF and WebP images up to `PROTON_MCP_MAX_INLINE_IMAGE_BYTES` (default 1048576) as an image content block;
- PDFs as extracted text with the page count;
- Office and OpenDocument files as text (see "Office documents as text");
- iCalendar files as a summary followed by the raw text (see "Calendar files summarized");
- `message/rfc822` or `.eml` attachments as the embedded message's From, To, Cc, Date, Subject, attachment list and readable body;
- other text types (`text/*`, JSON, XML, CSV, YAML, JavaScript, `+xml`) and the extensions `.txt .csv .json .xml .md .log .vcf .yaml .yml` as text, with HTML converted to text including links.
Text content SHALL be paged with `offset` and `maxChars` (500–100000, default 20000).

#### Scenario: PDF invoice
- **WHEN** the attachment is a PDF with a text layer
- **THEN** its text is returned with the number of pages

#### Scenario: Image
- **WHEN** the attachment is a 200 KB JPEG
- **THEN** an image block with MIME type `image/jpeg` is returned

#### Scenario: Raised image limit
- **WHEN** `PROTON_MCP_MAX_INLINE_IMAGE_BYTES=5242880` and the attachment is a 3 MB PNG
- **THEN** an image block is returned

### Requirement: Save files that cannot be shown
Attachments of other types, images larger than `PROTON_MCP_MAX_INLINE_IMAGE_BYTES`, PDFs without extractable text, and Office documents that cannot be read (encrypted, damaged, legacy binary formats) SHALL be saved to the attachment folder and the absolute path returned; for oversized images the response SHALL say that the image exceeds the inline limit. With `save: true` any attachment SHALL be saved instead of shown. Filenames SHALL be reduced to their base name with `/\:*?"<>|` and control characters replaced; an existing file SHALL NOT be overwritten – a suffix ` (n)` SHALL be added instead. The folder SHALL be created if missing.

#### Scenario: Archive file
- **WHEN** the attachment is a `.zip`
- **THEN** it is saved to the attachment folder and the response says it cannot be shown directly and gives the path

#### Scenario: Word document
- **WHEN** the attachment is a `.doc`
- **THEN** it is saved to the attachment folder and the response says its text cannot be read and gives the path

#### Scenario: Scanned PDF
- **WHEN** a PDF has no extractable text
- **THEN** it is saved and the response says it is scanned or protected

#### Scenario: Name collision
- **WHEN** `rechnung.pdf` already exists in the attachment folder
- **THEN** the file is saved as `rechnung (1).pdf`

#### Scenario: Large photo
- **WHEN** the attachment is a 3 MB JPEG and the default limit applies
- **THEN** it is saved and the response says it exceeds the inline limit and gives the path

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
