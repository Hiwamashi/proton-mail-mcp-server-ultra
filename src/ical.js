// Minimal iCalendar (RFC 5545) reader for invitations and .ics attachments: line unfolding,
// parameters, value unescaping, VEVENT and VTIMEZONE. Produces a readable summary per event.

// ---- Parsing ----

function parseLine(line) {
  let i = 0;
  let inQuotes = false;
  let colon = -1;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;
  const [name, ...rawParams] = line.slice(0, colon).match(/(?:[^;"]|"[^"]*")+/g) || [];
  if (!name) return null;
  const params = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq === -1) continue;
    params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

// Returns the component tree: { name, props: [{ name, params, value }], components: [] }.
export function parseICalendar(source) {
  const root = { name: "ROOT", props: [], components: [] };
  const stack = [root];
  const lines = String(source).replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const prop = parseLine(line);
    if (!prop) continue;
    if (prop.name === "BEGIN") {
      const component = { name: prop.value.trim().toUpperCase(), props: [], components: [] };
      stack.at(-1).components.push(component);
      stack.push(component);
    } else if (prop.name === "END") {
      if (stack.length > 1) stack.pop();
    } else {
      stack.at(-1).props.push(prop);
    }
  }
  return root;
}

export function unescapeText(value) {
  return (value || "").replace(/\\([nN,;\\])/g, (_, ch) => (ch === "n" || ch === "N" ? "\n" : ch));
}

const prop = (component, name) => component.props.find((p) => p.name === name);
const props = (component, name) => component.props.filter((p) => p.name === name);

function findAll(component, name, out = []) {
  for (const child of component.components) {
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

// ---- Date and time ----

const pad = (n) => String(n).padStart(2, "0");

// "20261005T140000Z" / "20261005T140000" / "20261005" → parts, or null.
export function parseDateValue(value) {
  const m = (value || "").trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  return {
    year: +m[1],
    month: +m[2],
    day: +m[3],
    hour: +(m[4] || 0),
    minute: +(m[5] || 0),
    second: +(m[6] || 0),
    dateOnly: m[4] === undefined,
    utc: m[7] === "Z",
  };
}

const wallMs = (p) => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

function formatWall(p) {
  const date = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  if (p.dateOnly) return date;
  return `${date} ${pad(p.hour)}:${pad(p.minute)}${p.second ? `:${pad(p.second)}` : ""}`;
}

function formatUtc(ms) {
  const d = new Date(ms);
  return formatWall({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds() });
}

// Offset (ms) of an IANA zone at instant `ms`, or null if the zone is unknown to Intl.
function ianaOffset(tzid, ms) {
  let format;
  try {
    format = new Intl.DateTimeFormat("en-US", { timeZone: tzid, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
  } catch {
    return null;
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute, +parts.second) - Math.floor(ms / 1000) * 1000;
}

function parseOffset(value) {
  const m = (value || "").trim().match(/^([+-])(\d{2})(\d{2})(\d{2})?$/);
  if (!m) return null;
  return (m[1] === "-" ? -1 : 1) * ((+m[2] * 60 + +m[3]) * 60 + +(m[4] || 0)) * 1000;
}

const WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Local onset (wall-clock ms) of a yearly observance rule in `year`, e.g. BYMONTH=3;BYDAY=-1SU.
function yearlyOnset(rule, start, year) {
  const r = Object.fromEntries(rule.split(";").map((kv) => kv.split("=")));
  if (r.FREQ !== "YEARLY") return null;
  const month = +(r.BYMONTH || start.month);
  const time = [start.hour, start.minute, start.second];
  if (r.BYMONTHDAY) return Date.UTC(year, month - 1, +r.BYMONTHDAY, ...time);
  const m = (r.BYDAY || "").match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
  if (!m) return Date.UTC(year, month - 1, start.day, ...time);
  const n = +(m[1] || 1);
  const weekday = WEEKDAYS[m[2]];
  if (n > 0) {
    const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return Date.UTC(year, month - 1, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7, ...time);
  }
  const lastDay = new Date(Date.UTC(year, month, 0));
  const back = (lastDay.getUTCDay() - weekday + 7) % 7;
  return Date.UTC(year, month - 1, lastDay.getUTCDate() - back + (n + 1) * 7, ...time);
}

// Offset (ms) for a wall-clock time from the file's VTIMEZONE: the observance with the latest onset
// at or before that time wins. Handles yearly BYMONTH/BYDAY rules, fixed DTSTARTs and RDATEs.
function vtimezoneOffset(vtimezone, wall) {
  const year = new Date(wall).getUTCFullYear();
  let best = null;
  for (const obs of vtimezone.components.filter((c) => c.name === "STANDARD" || c.name === "DAYLIGHT")) {
    const start = parseDateValue(prop(obs, "DTSTART")?.value);
    const offset = parseOffset(prop(obs, "TZOFFSETTO")?.value);
    if (!start || offset === null) continue;
    const onsets = [wallMs(start)];
    const rule = prop(obs, "RRULE")?.value;
    if (rule) {
      // A rule only applies from its DTSTART up to its UNTIL (e.g. US rules before and after 2007).
      const until = parseDateValue(rule.match(/(?:^|;)UNTIL=([^;]+)/)?.[1]);
      for (const y of [year - 1, year]) {
        const onset = yearlyOnset(rule, start, y);
        if (onset !== null && onset >= wallMs(start) && (!until || onset <= wallMs(until))) onsets.push(onset);
      }
    }
    for (const rdate of props(obs, "RDATE").flatMap((p) => p.value.split(","))) {
      const p = parseDateValue(rdate);
      if (p) onsets.push(wallMs(p));
    }
    for (const onset of onsets) {
      if (onset !== null && onset <= wall && (!best || onset > best.onset)) best = { onset, offset };
    }
  }
  return best?.offset ?? null;
}

// UTC instant (ms) for a DATE-TIME value, or null for floating times and unknown zones.
function toUtc(parts, tzid, timezones) {
  if (parts.utc) return wallMs(parts);
  if (!tzid) return null;
  const wall = wallMs(parts);
  const guess = ianaOffset(tzid, wall);
  if (guess !== null) {
    const second = ianaOffset(tzid, wall - guess);
    return wall - second;
  }
  const vtimezone = timezones.get(tzid);
  const offset = vtimezone ? vtimezoneOffset(vtimezone, wall) : null;
  return offset === null ? null : wall - offset;
}

function describeTime(p, timezones, { allDayEnd = false } = {}) {
  if (!p) return null;
  const parts = parseDateValue(p.value);
  if (!parts) return p.value;
  if (parts.dateOnly || p.params.VALUE === "DATE") {
    if (!allDayEnd) return formatWall({ ...parts, dateOnly: true });
    // DTEND of an all-day event is exclusive; show the last day.
    const last = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 86400000);
    return `${formatWall({ year: last.getUTCFullYear(), month: last.getUTCMonth() + 1, day: last.getUTCDate(), dateOnly: true })} (last day)`;
  }
  if (parts.utc) return `${formatWall(parts)} UTC`;
  const tzid = p.params.TZID;
  if (!tzid) return `${formatWall(parts)} (floating time, no time zone)`;
  const utc = toUtc(parts, tzid, timezones);
  return `${formatWall(parts)} (${tzid})${utc === null ? "" : ` = ${formatUtc(utc)} UTC`}`;
}

// ---- Summary ----

function person(p) {
  if (!p) return null;
  const address = p.value.replace(/^mailto:/i, "").trim();
  const name = p.params.CN;
  return name && name !== address ? `${name} <${address}>` : address;
}

const ROLES = { "REQ-PARTICIPANT": "required", "OPT-PARTICIPANT": "optional", CHAIR: "chair", "NON-PARTICIPANT": "for information" };

function describeEvent(event, timezones) {
  const lines = [];
  const add = (label, value) => value && lines.push(`  ${label}: ${value}`);
  const start = prop(event, "DTSTART");
  const allDay = Boolean(start && (start.params.VALUE === "DATE" || parseDateValue(start.value)?.dateOnly));
  add("Title", unescapeText(prop(event, "SUMMARY")?.value) || "(no title)");
  if (prop(event, "RECURRENCE-ID")) add("Changes occurrence", describeTime(prop(event, "RECURRENCE-ID"), timezones));
  add("Start", describeTime(start, timezones));
  const end = prop(event, "DTEND");
  if (end) add("End", describeTime(end, timezones, { allDayEnd: allDay }));
  else add("Duration", prop(event, "DURATION")?.value);
  add("All-day", allDay ? "yes" : "no");
  add("Location", unescapeText(prop(event, "LOCATION")?.value));
  add("Organizer", person(prop(event, "ORGANIZER")));
  const attendees = props(event, "ATTENDEE");
  if (attendees.length) {
    lines.push("  Attendees:");
    for (const a of attendees) {
      const role = ROLES[a.params.ROLE] || (a.params.ROLE || "").toLowerCase();
      lines.push(`    - ${person(a)}: ${a.params.PARTSTAT || "NEEDS-ACTION"}${role ? ` (${role})` : ""}`);
    }
  }
  add("Recurrence", props(event, "RRULE").map((r) => r.value).join(" | "));
  const exdates = props(event, "EXDATE").flatMap((p) => p.value.split(",").map((value) => describeTime({ ...p, value }, timezones)));
  if (exdates.length) add("Excluded dates", exdates.join(", "));
  add("Status", prop(event, "STATUS")?.value);
  const description = unescapeText(prop(event, "DESCRIPTION")?.value).trim();
  if (description) lines.push("  Description:", ...description.split("\n").map((l) => `    ${l}`));
  return lines;
}

// Readable summary of all VEVENTs, starting with the METHOD (REQUEST, CANCEL, REPLY, …).
export function summarizeCalendar(source) {
  const root = parseICalendar(source);
  const calendar = root.components.find((c) => c.name === "VCALENDAR") || root;
  const timezones = new Map(findAll(calendar, "VTIMEZONE").map((tz) => [prop(tz, "TZID")?.value, tz]));
  const events = findAll(calendar, "VEVENT");
  const method = prop(calendar, "METHOD")?.value?.trim();
  const lines = [`Calendar method: ${method || "none (plain calendar file)"}`];
  if (!events.length) lines.push("No events in this calendar file.");
  events.forEach((event, i) => {
    lines.push(`Event ${i + 1} of ${events.length}:`, ...describeEvent(event, timezones));
  });
  return lines.join("\n");
}
