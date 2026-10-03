// Language of generated reply quotes and forward headers (PROTON_MCP_LOCALE), and the patterns quote
// stripping uses. Stripping matches every locale regardless of the setting, because incoming mail can
// be in any language. Formats follow the usual Gmail/Apple Mail wording per language.

export const LOCALES = {
  de: {
    tag: "de-DE",
    wrote: "schrieb",
    attribution: (when, who) => (when ? `Am ${when} schrieb ${who}:` : `${who} schrieb:`),
    unknownSender: "unbekannt",
    forward: { separator: "---------- Weitergeleitete Nachricht ----------", from: "Von", date: "Datum", subject: "Betreff", to: "An", cc: "Cc" },
  },
  en: {
    tag: "en-US",
    wrote: "wrote",
    attribution: (when, who) => (when ? `On ${when}, ${who} wrote:` : `${who} wrote:`),
    unknownSender: "unknown",
    forward: { separator: "---------- Forwarded message ---------", from: "From", date: "Date", subject: "Subject", to: "To", cc: "Cc" },
  },
  fr: {
    tag: "fr-FR",
    wrote: "a écrit",
    attribution: (when, who) => (when ? `Le ${when}, ${who} a écrit :` : `${who} a écrit :`),
    unknownSender: "inconnu",
    forward: { separator: "---------- Message transféré ---------", from: "De", date: "Date", subject: "Objet", to: "À", cc: "Cc" },
  },
  es: {
    tag: "es-ES",
    wrote: "escribió",
    attribution: (when, who) => (when ? `El ${when}, ${who} escribió:` : `${who} escribió:`),
    unknownSender: "desconocido",
    forward: { separator: "---------- Mensaje reenviado ---------", from: "De", date: "Fecha", subject: "Asunto", to: "Para", cc: "CC" },
  },
  it: {
    tag: "it-IT",
    wrote: "ha scritto",
    attribution: (when, who) => (when ? `Il ${when}, ${who} ha scritto:` : `${who} ha scritto:`),
    unknownSender: "sconosciuto",
    forward: { separator: "---------- Messaggio inoltrato ---------", from: "Da", date: "Data", subject: "Oggetto", to: "A", cc: "Cc" },
  },
};

export const LOCALE_NAMES = Object.keys(LOCALES);
export const DEFAULT_LOCALE = "de";
export const DEFAULT_TIMEZONE = "Europe/Berlin";

export function parseLocale(value) {
  const locale = (value ?? "").trim().toLowerCase() || DEFAULT_LOCALE;
  if (!LOCALES[locale]) {
    throw new Error(`Invalid PROTON_MCP_LOCALE "${value}". Valid values: ${LOCALE_NAMES.map((l) => `"${l}"`).join(", ")}.`);
  }
  return locale;
}

export function parseTimeZone(value) {
  const timeZone = (value ?? "").trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en", { timeZone });
  } catch {
    throw new Error(`Invalid PROTON_MCP_TIMEZONE "${value}". Use an IANA time zone name such as "Europe/Berlin" or "America/New_York".`);
  }
  return timeZone;
}

const formatters = new Map();

// Medium date and short time in the locale's language and the given time zone.
export function formatQuoteDate(date, locale = DEFAULT_LOCALE, timeZone = DEFAULT_TIMEZONE) {
  if (!date || Number.isNaN(new Date(date).getTime())) return "";
  const key = `${locale}|${timeZone}`;
  if (!formatters.has(key)) {
    formatters.set(key, new Intl.DateTimeFormat(LOCALES[locale].tag, { dateStyle: "medium", timeStyle: "short", timeZone }));
  }
  return formatters.get(key).format(date);
}

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Line patterns that start a quoted history, for all locales. After the locale's "wrote" word comes
// either the colon (French with a space before it) or, as in German, the sender and then the colon.
// No \b after the word: JavaScript does not treat "ó" in "escribió" as a word character.
export const QUOTE_HEADER_PATTERNS = [
  new RegExp(
    `^\\s*(${Object.values(LOCALES).map((l) => escape(l.attribution("X", "Y").split(" ")[0])).join("|")})\\s.{4,200}\\s(${Object.values(LOCALES)
      .map((l) => escape(l.wrote))
      .join("|")})(\\s.*)?\\s?:\\s*$`,
    "i"
  ),
  // Attribution without a date ("Max <max@x.de> wrote:", "unknown wrote:"): only with an address or
  // the unknown-sender word in front, so ordinary sentences ending in "wrote:" are not cut.
  new RegExp(
    `^\\s*(?:[^<>\\n]{0,100}<[^\\s<>@]+@[^\\s<>]+>|[^\\s<>@]+@[^\\s<>]+|${Object.values(LOCALES)
      .map((l) => escape(l.unknownSender))
      .join("|")})\\s(${Object.values(LOCALES)
      .map((l) => escape(l.wrote))
      .join("|")})\\s?:\\s*$`,
    "i"
  ),
  new RegExp(
    `^\\s*-{2,}\\s*(Original Message|Ursprüngliche Nachricht|Originalnachricht|${Object.values(LOCALES)
      .map((l) => escape(l.forward.separator.replace(/^-+\s*|\s*-+$/g, "")))
      .join("|")})\\s*-{2,}`,
    "i"
  ),
  /^\s*_{10,}\s*$/,
];
