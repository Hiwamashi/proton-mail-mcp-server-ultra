# Spec Delta

## MODIFIED Requirements

### Requirement: Render attachments by type
`get_attachment` SHALL return, after a header line with index, name, type, size and UID:
- PNG, JPEG, GIF and WebP images up to `PROTON_MCP_MAX_INLINE_IMAGE_BYTES` (default 1048576) as an image content block;
- PDFs as extracted text with the page count;
- `message/rfc822` or `.eml` attachments as the embedded message's From, To, Cc, Date, Subject, attachment list and readable body;
- text types (`text/*`, JSON, XML, CSV, YAML, JavaScript, ICS, `+xml`) and the extensions `.txt .csv .json .xml .md .log .ics .vcf .yaml .yml` as text, with HTML converted to text including links.
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
Attachments of other types, images larger than `PROTON_MCP_MAX_INLINE_IMAGE_BYTES`, and PDFs without extractable text SHALL be saved to the attachment folder and the absolute path returned; for oversized images the response SHALL say that the image exceeds the inline limit. With `save: true` any attachment SHALL be saved instead of shown. Filenames SHALL be reduced to their base name with `/\:*?"<>|` and control characters replaced; an existing file SHALL NOT be overwritten – a suffix ` (n)` SHALL be added instead. The folder SHALL be created if missing.

#### Scenario: Word document
- **WHEN** the attachment is a `.docx`
- **THEN** it is saved to the attachment folder and the response says it cannot be shown directly and gives the path

#### Scenario: Scanned PDF
- **WHEN** a PDF has no extractable text
- **THEN** it is saved and the response says it is scanned or protected

#### Scenario: Name collision
- **WHEN** `rechnung.pdf` already exists in the attachment folder
- **THEN** the file is saved as `rechnung (1).pdf`

#### Scenario: Large photo
- **WHEN** the attachment is a 3 MB JPEG and the default limit applies
- **THEN** it is saved and the response says it exceeds the inline limit and gives the path
