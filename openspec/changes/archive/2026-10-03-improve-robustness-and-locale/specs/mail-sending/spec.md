# Spec Delta

## MODIFIED Requirements

### Requirement: Quoted original
With `quoteOriginal` (default true) the reply SHALL append the original's readable body below the new text, each line prefixed with `> `, preceded by an attribution line in the language of `PROTON_MCP_LOCALE` (`de` default: `Am <date> schrieb <sender>:`; `en`: `On <date>, <sender> wrote:`; `fr`: `Le <date>, <sender> a écrit :`; `es`: `El <date>, <sender> escribió:`; `it`: `Il <date>, <sender> ha scritto:`). The date SHALL use the locale's medium date and short time in the time zone `PROTON_MCP_TIMEZONE` (default `Europe/Berlin`). An unknown locale or time zone SHALL stop the server at startup with an error. Every attribution format SHALL be recognized by quote stripping. If `html` is given, the HTML reply SHALL contain the original HTML (or the escaped text) in a Proton-style blockquote.

#### Scenario: Plain text reply
- **WHEN** `reply_to_email` is called with only `body` and default settings
- **THEN** the sent text is the body, a blank line, the German attribution and the `> `-quoted original

#### Scenario: English attribution
- **WHEN** `PROTON_MCP_LOCALE=en` and `PROTON_MCP_TIMEZONE=America/New_York`
- **THEN** the attribution reads `On <date in New York time>, <sender> wrote:`

#### Scenario: Round trip with quote stripping
- **WHEN** a reply created with any supported locale is read with `stripQuoted: true`
- **THEN** only the new text is returned

#### Scenario: Invalid time zone
- **WHEN** `PROTON_MCP_TIMEZONE=Mars/Olympus`
- **THEN** the server exits at startup with an error naming the variable
