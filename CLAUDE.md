# CLAUDE.md

MCP-Server für Proton Mail über die Proton Mail Bridge (IMAP/SMTP): Mails lesen, Anhänge auslesen, Entwürfe anlegen und versenden (Node ≥ 20, ESM, `node:test`).

## LLM-Gateway — Label-Pflicht

> **Verbindlich, nicht abwählbar.** Jede Claude-Code-Session in diesem Projekt
> trägt das Repo-Label `x-bf-lh-repo: local/proton-mcp-ultra`. Über dieses Label erfasst
> das WRS-LLM-Gateway (Bifrost) Token-Verbrauch und Kosten je Repository — ohne
> Label ist die Nutzung dieses Projekts nicht zuordenbar. Ein separates
> Token-Protokoll in der Codebase ist deshalb nicht nötig und wird nicht geführt.

**Der Header-Name ist nicht frei wählbar.** Bifrost protokolliert Header nicht von
sich aus; automatisch in die Log-Metadaten übernommen wird nur, was den Präfix
`x-bf-lh-` trägt — der Präfix fällt dabei weg, der Rest wird zum Metadaten-Schlüssel
(`repo`). Der früher verwendete Header `x-bf-label` liegt dagegen in Bifrosts
eigenem Steuer-Namensraum, ist dort keine Funktion und wird verworfen: Die
Kostenzuordnung über Labels blieb dadurch von Juli bis September 2026 durchgehend
leer. Den Namen nicht zurückändern und nicht „aufräumen".

Gesetzt wird das Label projektweit über `env` in der eingecheckten
`.claude/settings.json` — nicht über persönliche Shell-Wrapper. Damit gilt es
für jeden, der das Repo klont:

```json
{
  "env": {
    "ANTHROPIC_CUSTOM_HEADERS": "x-bf-lh-repo: local/proton-mcp-ultra"
  }
}
```

**Die Gateway-Anbindung selbst ist optional.** Base-URL und Key gehören nicht
zum verbindlichen Teil:

- `ANTHROPIC_BASE_URL` steht nur dann in der `settings.json`, wenn dieses Projekt
  bewusst über das Gateway läuft:

  ```json
  {
    "env": {
      "ANTHROPIC_BASE_URL": "<GATEWAY-URL>",
      "ANTHROPIC_CUSTOM_HEADERS": "x-bf-lh-repo: local/proton-mcp-ultra"
    }
  }
  ```

  Fehlt der Eintrag, läuft die Session an einem anderen Endpunkt und das Label
  wird nirgends ausgewertet. Es bleibt trotzdem gesetzt — es kostet nichts und
  greift, sobald jemand die Session doch über das Gateway führt.
- Der Gateway-Key gehört **nie** ins Repository. Er wird lokal gesetzt — per
  `ANTHROPIC_AUTH_TOKEN` in der Shell oder in `.claude/settings.local.json`
  (gitignored) — oder er fehlt schlicht, wenn kein Gateway im Spiel ist.

Ein SessionStart-Hook (`.claude/scripts/set-repo-header.sh --hook`) prüft bei
jedem Start, ob das Label gesetzt ist und zum aktuellen Repository passt.
Fehlende Base-URL und fehlender Key ergeben dort einen **Hinweis**, keinen
Fehler.

**Regeln für KI-Agenten in diesem Projekt:**

- Den `env`-Eintrag `ANTHROPIC_CUSTOM_HEADERS` und den SessionStart-Hook nicht
  entfernen, umbenennen oder auf einen anderen Wert setzen.
- Meldet der Hook ein **fehlendes oder abweichendes Label**, ist das ein
  Konfigurationsfehler und **keine** Nebensächlichkeit: melde ihn dem Nutzer,
  bevor du inhaltlich weiterarbeitest. Hinweise zur optionalen Gateway-Anbindung
  (Base-URL, Key) sind dagegen kein Grund, die Arbeit zu unterbrechen.
- Wird das Repository umbenannt, verschoben oder geforkt, ändert sich das
  erwartete Label. Dann `/wrs-agent-rules` erneut ausführen, statt den Wert von
  Hand zu raten.

## Dokumentations-Richtlinie

> Im Ordner `feature-documentation/` müssen alle neuen Funktionen und Features sowie deren Anpassungen in einzelnen `.md`-Dateien im Markdown-Format dokumentiert werden. Pro Funktion und Markdown eine Datei. Sollte ein Feature aus mehreren Funktionen bestehen, dürfen Unterordner pro Feature angelegt werden. Diese Dokumentation dient vor allem anderen KI-Coding-Agenten zum besseren Verständnis der Codebase.

> Der aktuelle Entwicklungsfortschritt ist fortlaufend in einer `PROGRESS.md` im Projekt-Root zu dokumentieren. Dort wird festgehalten, welche Features bereits umgesetzt sind, welche in Arbeit sind und welche noch ausstehen. So haben alle Beteiligten (Mensch und KI-Agent) jederzeit einen aktuellen Überblick über den Stand der Entwicklung.

## OpenSpec — Spec-Driven Development

Dieses Projekt nutzt [OpenSpec](https://github.com/Fission-AI/OpenSpec), um
Änderungen vor der Umsetzung als Spezifikation festzuhalten. Die gültigen Specs
liegen unter `openspec/specs/`, laufende Änderungen unter `openspec/changes/`.

### Setup (einmalig pro Repo)

Wenn `openspec/` nicht existiert:

1. Prüfe, ob `openspec` als CLI verfügbar ist (`openspec --version`).
   Falls nicht: `npm install -g @fission-ai/openspec`
2. Initialisiere das Repo: `openspec init --tools claude`
   Das legt `openspec/` sowie die Skills `.claude/skills/openspec-*` und die
   Kommandos `.claude/commands/opsx/` an — alles wird mit eingecheckt.
3. Trage Tech-Stack, Konventionen und Fachbegriffe als `context` in
   `openspec/config.yaml` ein, damit neue Artefakte darauf aufbauen.

### Nutzung

- Für neue Funktionen und Verhaltensänderungen, die mehr als eine Datei
  betreffen: zuerst einen Change anlegen (`/opsx:propose`), dann umsetzen
  (`/opsx:apply`), nach Abschluss archivieren (`/opsx:archive`).
- Bei unklaren Anforderungen erst `/opsx:explore` nutzen, statt direkt einen
  Change zu schreiben.
- Kleine Bugfixes, Tippfehler und reine Refactorings ohne Verhaltensänderung
  brauchen keinen Change.
- Lies vor Änderungen an einem Bereich die passende Spec unter `openspec/specs/`.
  Weicht der Code von der Spec ab, sprich den Widerspruch an, statt ihn still
  in eine Richtung aufzulösen.
- Prüfe Changes mit `openspec validate`, bevor du sie zur Umsetzung freigibst.

### Aktualisierung

- Nach einem Update der CLI: `openspec update`, damit die Skills und Kommandos
  im Repo zur installierten Version passen.

## Subagents proaktiv nutzen

- Prüfe bei jeder nicht-trivialen Aufgabe, ob sie sich für die Delegation an einen Subagent (Agent/Task-Tool) eignet – insbesondere bei:
  - breiter Codebase-Recherche (mehr als ~3 Suchanfragen)
  - unabhängigen, parallelisierbaren Teilaufgaben
  - Aufgaben, die viel Kontext (Logs, große Dateien) erzeugen würden
- Wenn eine Delegation sinnvoll ist, schlage sie **aktiv vor**, bevor du selbst loslegst: nenne kurz den Subagent-Typ und warum.
- Bei mehreren unabhängigen Teilaufgaben: schlage vor, sie parallel über mehrere Subagents laufen zu lassen.

### Beispielhafte Subagent-Rollen

Die folgenden Rollen sind **nur Beispiele** zur Orientierung, keine abschließende Liste. Leite passende Subagents jeweils aus der konkreten Aufgabe und aus dem ab, was dieses Projekt tatsächlich braucht:

- **Dokumentations-Experte** – Erstellt/aktualisiert Doku (z.B. `feature-documentation/`, README, Changelog). Vorschlagen, wenn neue Funktionen ergänzt oder bestehende geändert wurden und die Doku nachgezogen werden muss.
- **Code-Reviewer** – Prüft Diffs auf Bugs, Sicherheitslücken (OWASP), Performance und Stil. Vorschlagen nach größeren Änderungen oder vor einem Commit/PR. **Prüfe aber zuerst, ob bereits Hooks, Review-Gates oder Review-Skills (z.B. pre-commit-Hooks, CI-Checks, ein `/code-review`-Skill oder ein konfiguriertes Stop-Review-Gate) vorhanden sind** – wenn ja, nutze bzw. verweise auf diese, statt einen zusätzlichen Review-Subagent doppelt einzusetzen.
- **Recherche-/Explore-Experte** – Durchsucht die Codebase oder externe Quellen und liefert eine verdichtete Zusammenfassung. Vorschlagen bei "Wo ist X?", "Wie hängt Y zusammen?" oder breiter Architektur-Recherche.
- **Test-/Verifikations-Experte** – Führt Tests, Builds oder Linting aus und meldet nur das Ergebnis zurück. Vorschlagen, bevor eine Änderung als fertig gemeldet wird.
- **Refactoring-Experte** – Nimmt mechanische Umbenennungen/Umstrukturierungen über viele Dateien vor. Vorschlagen bei wiederkehrenden Änderungen an vielen Stellen.
- **Datenbank-/Migrations-Experte** – Prüft Schema-Änderungen und Migrationen auf Sicherheit. Vorschlagen bei Eingriffen in DB-Struktur oder Migrationen.

Passt eine dieser Rollen nicht zum Projekt, ist eine **projektspezifische Rolle die bessere Wahl** – etwa ein Experte für die eingesetzte Kassen-, Shop- oder ERP-Schnittstelle, für ein bestimmtes Framework oder für einen wiederkehrenden Datenimport. Solche Rollen aus dem Projekt ableiten und benennen, statt eine der Beispielrollen zu verbiegen.

Diese Rollen kannst du entweder ad-hoc über das Agent/Task-Tool ansprechen oder als feste Subagents unter `~/.claude/agents/` bzw. `.claude/agents/` definieren (mit `use proactively` in der `description`).
