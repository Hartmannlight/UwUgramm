# Projektstruktur

```text
frontend/src/
  main.tsx                   React-Einstieg
  app/                       Arbeitsfläche, Darstellung und Panels
  features/
    diagram/                 Baumvertrag, Sprache, Layout und Diagramm-Editor
    python/                  Python-Puffer und sichere Synchronisierung
    projects/                Projekte, Ordner, Dialoge und Speicherung
  shared/                    HTTP-Client und gemeinsamer Dialog

backend/app/
  main.py                    App, Middleware, Fehlergrenzen und Healthcheck
  api/                       Router für Auth, Projekte, Ordner, Freigaben, Konvertierung
  services/projects.py       Besitzerprüfung, Kontingente und Antwortdarstellungen
  conversion/
    parser.py                Python-AST und Diagramm-Konvertierung
    type_names.py            Kontextabhängige Sprach- und Typübersetzung
    protocol.py              UTF-8-Nachrichten und gemeinsame Bytegrenze
    service.py               Nebenläufigkeit und Lebenszyklus des Parser-Prozesses
    worker.py                Begrenzter Unterprozess ohne Codeausführung
  db.py                      Datenbankmodelle und Sitzungen
  schema.py                  API- und Diagrammvalidierung
  security.py                Sitzungen, CSRF und Rate-Limits
  settings.py                Konfiguration und Produktionsprüfungen

backend/migrations/          Datenbankschema und Migrationen
backend/tests/               API-, Sicherheits- und Konvertierungstests
scripts/                     Gemeinsame Prüfabläufe für PowerShell und Bash
docs/                        Architektur, Entwicklung, Betrieb und Prüfergebnisse
  screenshots/               Dokumentierte Ansichten der Oberfläche
  assets/                    Entstehungsquelle der mitgelieferten Grafik
```

Frontend-Tests liegen direkt bei ihrem Modul. `projects/model.ts` beschreibt
Projekte und Ordner; `diagram/model.ts` beschreibt den Diagrammbaum. Die übrigen
Features importieren diese Verträge direkt, ohne zusätzliche Weiterleitungsdateien.

`workspaceState.ts` enthält reine Zustandsänderungen einschließlich Historie,
Projektlimit und Cloud-Zusammenführung. `workspaceStorage.ts` kapselt die bisherigen
Browser-Schlüssel. `useWorkspace.ts` verbindet diese beiden Module mit React und
den asynchronen API-Anfragen. Spätere Antworten werden auf den aktuellen Zustand
angewendet; eine initiale Serverliste ergänzt vorhandene Projekte. Bereits gelöschte
Projekte werden dabei nicht wiederhergestellt. Abmelden verwirft ausstehende Antworten
der alten Sitzung.

Die Grenze von 100 lokalen Projekten gilt beim **Anlegen**, nicht beim Wiederherstellen.
Größere bereits gespeicherte Listen bleiben zugänglich. Bei 100 oder mehr lokalen
Projekten muss vor dem Anlegen ein Projekt entfernt oder in die Cloud verschoben werden.

Backend-Router enthalten HTTP-Endpunkte. Gemeinsame Besitzerprüfungen liegen in
`services`, die Konvertierung bleibt als eigener Bereich isoliert. HTTP-Pfade,
Datenbankschema und bestehende Browser-Schlüssel wurden bei der Aufteilung erhalten.
Der Worker liest und schreibt explizit UTF-8-Bytes; Unicode wird nicht in ASCII-Escapes
vergrößert. Die gemeinsame Grenze beträgt 256 KiB.

`node_modules`, virtuelle Umgebungen, lokale Datenbanken, Caches, Builds und
temporäre `output`-Dateien sind nicht Teil des Quellcodes. Zugangsdaten liegen in
der ignorierten `.env`. Vorhandene lokale Datenbanken bleiben beim Aufräumen erhalten.
