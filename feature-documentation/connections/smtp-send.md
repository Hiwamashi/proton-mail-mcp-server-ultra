**[Deutsch](#deutsch) · [English](#english)**

---

## Deutsch

# SMTP-Versand: Frische Verbindung pro Mail

**Datei:** src/connections.js, Funktion `sendMail()`

## Zweck

Die Funktion `sendMail()` versendet eine Mail über SMTP. Sie erzeugt für jeden Versand eine neue Verbindung zur Bridge und schließt sie danach sofort, ohne zu versuchen, Fehler durch einen Retry zu korrigieren.

## Verhalten

```javascript
export async function sendMail(mailOptions) {
  const transport = createSmtpTransport();
  try {
    return await transport.sendMail(mailOptions);
  } finally {
    transport.close();
  }
}
```

1. **Neue Verbindung:** Jeder Aufruf erstellt ein neues `nodemailer`-Transport-Objekt
2. **Versand:** `sendMail()` wird auf den Transport angewendet
3. **Cleanup:** Die Verbindung wird geschlossen, egal ob erfolgreich oder fehlgeschlagen
4. **Kein Retry:** Falls der Versand fehlschlägt, wird **nicht** automatisch erneut versucht

## Warum kein Retry

nodemailer meldet Socket-Fehler sowohl während als auch nach der Datenübertragung gleich. Ein automatischer Retry könnte die Mail zweimal versenden, wenn:

- Die Mail komplett übertragen wurde, aber die Bridge einen Fehler zurückmeldete
- Der Prozess die Rückmeldung nicht erhielt

Das Risiko einer doppelten Zustellung ist höher als der Vorteil eines Retries.

## Rückgabewert

Falls erfolgreich:

```javascript
{
  messageId: "<id@bridge.local>",
  // weitere Felder von nodemailer
}
```

## Fehlerbehandlung

Falls der Versand fehlschlägt, wirft `sendMail()` einen Error. Der Aufrufer (z. B. `send_email`, `reply_to_email`, `send_draft`) fängt ihn ab und gibt ihn an den MCP-Client zurück.

Häufige Fehler:

| Fehler | Ursache |
|---|---|
| `ECONNREFUSED` | Bridge läuft nicht oder SMTP-Port ist falsch |
| `Authentication failed` | Benutzername oder Bridge-Passwort falsch |
| `Sender address is invalid` | `PROTON_BRIDGE_FROM` ist keine bekannte Adresse des Kontos |
| Socket-Fehler | Bridge-Verbindung wurde unterbrochen |

## TLS-Einstellungen

Die Verbindung wird nach dem nodemailer-Standard konfiguriert:

```javascript
{
  host: CONFIG.host,
  port: CONFIG.smtpPort,
  secure: CONFIG.smtpSecure,        // true = implizites TLS
  requireTLS: !CONFIG.smtpSecure,   // für STARTTLS
  auth: { user: CONFIG.username, pass: CONFIG.password },
  tls: { rejectUnauthorized: false }, // Bridge nutzt self-signed cert
}
```

**`secure`** ist normalerweise `false` (STARTTLS), kann aber auf `true` gesetzt werden (implizites TLS), falls die Bridge anders konfiguriert ist.

---

## English

# SMTP sending: Fresh connection per message

**File:** src/connections.js, function `sendMail()`

## Purpose

The function `sendMail()` sends a message via SMTP. It creates a new connection to the Bridge for each send and closes it immediately afterwards without attempting to retry on error.

## Behavior

```javascript
export async function sendMail(mailOptions) {
  const transport = createSmtpTransport();
  try {
    return await transport.sendMail(mailOptions);
  } finally {
    transport.close();
  }
}
```

1. **New connection:** Each call creates a new `nodemailer` transport object
2. **Send:** `sendMail()` is applied to the transport
3. **Cleanup:** The connection is closed regardless of success or failure
4. **No retry:** If sending fails, **no** automatic retry is attempted

## Why no retry

nodemailer reports socket errors the same way before and after data transmission. An automatic retry could send the message twice if:

- The message was completely transmitted but the Bridge returned an error
- The process did not receive the acknowledgement

The risk of double delivery is higher than the benefit of a retry.

## Return value

If successful:

```javascript
{
  messageId: "<id@bridge.local>",
  // additional fields from nodemailer
}
```

## Error handling

If sending fails, `sendMail()` throws an error. The caller (e.g. `send_email`, `reply_to_email`, `send_draft`) catches it and returns it to the MCP client.

Common errors:

| Error | Cause |
|---|---|
| `ECONNREFUSED` | Bridge is not running or SMTP port is incorrect |
| `Authentication failed` | Username or Bridge password is wrong |
| `Sender address is invalid` | `PROTON_BRIDGE_FROM` is not a known address of the account |
| Socket errors | Bridge connection was interrupted |

## TLS settings

The connection is configured according to the nodemailer standard:

```javascript
{
  host: CONFIG.host,
  port: CONFIG.smtpPort,
  secure: CONFIG.smtpSecure,        // true = implicit TLS
  requireTLS: !CONFIG.smtpSecure,   // for STARTTLS
  auth: { user: CONFIG.username, pass: CONFIG.password },
  tls: { rejectUnauthorized: false }, // Bridge uses self-signed cert
}
```

**`secure`** is normally `false` (STARTTLS), but can be set to `true` (implicit TLS) if the Bridge is configured differently.
