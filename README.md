# UwUgramm

Ein direkt editierbarer Nassi-Shneiderman-Editor mit Python-Austausch,
Google-Anmeldung, privaten Projekten und Freigaben per kurzem Code.

[![Container release](https://github.com/Hartmannlight/UwUgramm/actions/workflows/container-release.yml/badge.svg)](https://github.com/Hartmannlight/UwUgramm/actions/workflows/container-release.yml)
[![CodeQL](https://github.com/Hartmannlight/UwUgramm/actions/workflows/codeql.yml/badge.svg)](https://github.com/Hartmannlight/UwUgramm/actions/workflows/codeql.yml)

CI, Sicherheitsprüfungen und AMD64-/ARM64-Releases sind in
[docs/PIPELINES.md](docs/PIPELINES.md) dokumentiert.

**Ohne Anmeldung direkt nutzen:** [UwUgramm auf GitHub Pages](https://hartmannlight.github.io/UwUgramm/).
Diese Instanz arbeitet ausschließlich lokal im Browser. Für eine eigene Instanz
ohne API und Datenbank siehe [statisches Hosting](docs/STATIC_HOSTING.md).

## Bedienung

- **Sofort starten:** Ohne Anmeldung werden Projekte lokal in diesem Browser gespeichert.
- **Schreiben statt klicken:** Bereits `if ` zeigt eine Bedingung. Danach `x = 10`
  tippen; Enter wechselt direkt in den Ja-Zweig. `while ` und `for ` werden ebenfalls
  sofort erkannt, `def …` wird mit Enter zur Funktion.
  Enter ergänzt Anweisungen, Tab wechselt Ja → Nein → dahinter, Alt+Enter verlässt
  den aktuellen Container. Enter im leeren Ja-Feld führt zu Nein, im leeren Nein-Feld
  unter das komplette If; in einer leeren Schleifenzeile hinter die Schleife.
  Das beim Verlassen bestätigte Leerfeld wird entfernt.
  Backspace entfernt leere Blöcke. ↑/↓ navigieren im umgebrochenen Text und wechseln
  an dessen erster/letzter Zeile den Block,
  Alt+↑/↓ verschieben einen Block. `/if` filtert Bausteine direkt im Feld;
  Pfeiltasten und Enter wählen aus. Escape verlässt das Textfeld.
- **Vervollständigung:** `pri` + Tab fügt `print("Text")` ein und markiert `Text`.
  Im Python-Editor stehen Einrückung, Klammerpaare und Snippets bereit.
- **Projekte:** Neu, Leeren und Löschen stehen in der oberen Leiste. Import,
  Export und Kopien sind direkt in der Seitenleiste erreichbar.
  Ordner lassen sich erstellen und umbenennen. Projekte können per Ziehen oder
  über „Projekt in Ordner“ zugeordnet werden. Nur leere Ordner lassen sich löschen.
- **Bereiche und Maus:** Projekte links und Python rechts sind einzeln einklappbar.
  Die Python-Trennlinie lässt sich ziehen oder mit Pfeiltasten verstellen; Enter
  klappt den Bereich ein. Breite und Sichtbarkeit bleiben gespeichert.
  Der schraffierte Griff links verschiebt komplette Blöcke einschließlich ihrer
  Unterblöcke, auch in andere Zweige. Einfügelinien zeigen das Ziel. Der rote
  Mülleimer beim Hover löscht einen Block; Rückgängig stellt ihn wieder her.
  Klick auf Ja/Nein öffnet die erste Anweisung des jeweiligen Zweigs.
- **Python:** Änderungen werden nach einer kurzen Schreibpause automatisch geprüft
  und übernommen. Bei unvollständigem Python bleibt der letzte gültige Diagrammstand
  sichtbar und gesperrt. Fehler korrigieren oder den Diagrammcode wiederherstellen;
  danach läuft die Synchronisierung weiter. Leerer Code leert das Diagramm.
  Leere Felder erzeugen nur dort `pass`, wo Python eine nicht leere Suite verlangt.
- **Cloud:** Nach Google-Anmeldung ein lokales Projekt mit „Speichern“ hochladen.
  Danach erfolgt die Synchronisierung automatisch. Konflikte werden nicht überschrieben;
  die Seitenleiste bietet „Kopie erstellen“. Ungespeicherte Cloud-Entwürfe werden
  kontogebunden im Tab-Speicher gesichert und beim Abmelden entfernt.
- **Teilen:** Ein achtstelliger Code im Format `ABCD-EFGH` gibt einen Snapshot für
  24 Stunden frei. Zum Kopieren ist eine Anmeldung nötig. Neue Codes ersetzen die
  vorherige Freigabe. Ein Widerruf verhindert neue Kopien, entfernt vorhandene Kopien aber nicht.
- **Arbeitsfläche:** Einheitliche Grundschriftgröße von 14 px und 600 px Grundbreite.
  Lange Texte brechen visuell bei etwa 70 Zeichen um, ohne den Python-Code zu ändern.
  If-Zweige bleiben symmetrisch, solange die symmetrische Breite höchstens 1.200 px
  beträgt. Darüber erhalten sie Platz nach Inhalt, mit 200 px Mindestbreite je Zweig.
  Die Dreiecksspitze folgt der tatsächlichen Spaltengrenze. Mausrad
  scrollt, Strg+Mausrad zoomt um die Mausposition. Plus erscheint an Einfügelinien beim Hover.
- **Darstellung:** Hell beim ersten Besuch, danach gespeicherte Auswahl. Dunkel und
  pinkes UwU mit laufender Katze und hüpfendem Kaninchen. Der UwU-Button wippt nach
  einer Sekunde und glänzt anschließend periodisch. Animationen sind standardmäßig
  an, über den Pause-Schalter abschaltbar und unter „Tastatur & Darstellung“ optional
  an die Systemeinstellung für reduzierte Bewegung koppelbar.
- **Variablen:** Cursor oder Hover auf einem Namen hebt gleiche Namen in Diagramm
  und Python hervor. Der Syntaxparser unterscheidet Namen von Kommentaren, normalen
  Zeichenketten und Typangaben; Ausdrücke in f-Strings werden berücksichtigt.
- **Funktionen:** Eigene Felder für Namen, Parameter und Rückgabetyp. Enter/Tab führt
  durch die Felder und anschließend in den Körper. Ein fehlender Rückgabetyp bleibt
  von einem ausdrücklich angegebenen `None` unterscheidbar; `return` ist gekennzeichnet.
- **Typkürzel:** `GZ`/`Ganzzahl` → `int`, `FKZ`/`RZ`/`FZ`/`Real`/`double` → `float`, `ZK`/`Text` → `str`,
  `WW` → `bool`, `Liste[GZ]`/`Liste<GZ>` → `list[int]`, `void` → `None`. Das gilt nur für
  Annotationen, auch an Parametern und Rückgaben. Eigene Typnamen, qualifizierte Typen,
  Zeichenketten, `Literal`-Werte und `Annotated`-Metadaten werden nicht umgedeutet.
  Bedingungen akzeptieren `=`, `≤`, `≥`, `≠`; benannte Argumente wie `f(x=10)`
  und der Walrus-Operator `:=` bleiben erhalten. Das ist eine Syntaxübersetzung,
  keine Laufzeit-Typprüfung.
- **Deutsche Schreibweisen:** `wenn`/`falls` für If, `solange` für While,
  `für`/`fuer` für For, `funktion`/`operation`/`prozedur` für Funktionen.
  `sonst` + Enter wechselt in den Nein-Zweig; `ende` + Enter verlässt den Container.
  `und`, `oder`, `nicht`, `wahr`, `falsch`, `←`, `:=`, `Rückgabe`, `Abbruch`,
  `Weiter` und `Ausgabe` werden kontextabhängig übersetzt.
  `für i ← 1 bis 10 schritt 2` zählt einschließlich der Endgrenze.
  Recherchegrundlage: [offizielle Abitur-Formelsammlung Baden-Württemberg, S. 22–23](https://www.schule-bw.de/faecher-und-schularten/berufliche-schularten/berufliches-gymnasium-oberstufe/musterpruefungsaufgaben-neue-bildungsplaene-abitur-2024/formelsammlung-it.pdf).
- **Mehrfachauswahl und nachprüfende Schleifen:** `switch wert`, `match wert` und
  `falls wert gleich` + Enter erzeugen Fälle plus Sonst-Zweig, exportiert als Python
  `match/case`. `falls x gleich 10` bleibt eine If-Bedingung. Kein C-Fallthrough.
  Do-While wiederholt nach dem Körper solange die Bedingung wahr ist;
  `wiederhole bis` endet bei wahrer Bedingung. Python nutzt `while True` und einen
  abschließenden Abbruchtest; `continue` prüft dieselbe Bedingung vor dem Sprung.
  Diese Form lässt sich auch wieder importieren. Darstellung orientiert sich an
  [Structorizer CASE](https://help.structorizer.fisch.lu/index.php?menu=52&page=)
  und [REPEAT](https://help.structorizer.fisch.lu/index.php?menu=55&page=).

## Architektur

Details und Entscheidungen vor der Implementierung: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```text
Browser: React + TypeScript + CodeMirror
          │ same-origin /api
Nginx ────┴── FastAPI ─── PostgreSQL
                 │          Benutzer, Sitzungen, Ordner, Projekte, Freigaben, Rate-Limits
                 ├── Google OIDC (Authorization Code + PKCE)
                 └── begrenzter Python-Parser-Prozess (AST, keine Ausführung)
```

Das Diagramm ist ein versionierter Baum. Frontend-Operationen ändern diesen Baum
unveränderlich; die Datenbank und beide Konvertierungsrichtungen verwenden denselben
Vertrag. Die API besitzt keine frei wählbare Benutzer-ID in Schreibanfragen.

## Starten und weiterentwickeln

- [Lokale Entwicklung und gemeinsame Prüfskripte](docs/DEVELOPMENT.md)
- [Docker, Google-Anmeldung und Serverbetrieb](docs/DEPLOYMENT.md)
- [Projektstruktur und Zuständigkeiten](docs/PROJECT_STRUCTURE.md)

## Bekannte Grenzen

- Python-Import unterstützt Anweisungen, if/elif/else, match/case, for, while und normale Funktionen.
  `try`, `with`, `class`, async, Dekoratoren, generische Funktionen und Schleifen-else
  werden verständlich abgewiesen. Formatierung wird normalisiert. Inline-Kommentare
  oder Kommentare innerhalb von Ausdrücken können verloren gehen; der Import meldet das.
- Keine Codeausführung und keine kollaborative Echtzeitbearbeitung.
- Maximal 500 Blöcke, 20 Verschachtelungen, jeweils 100 Projekte und Ordner je Konto
  und 50.000 Zeichen Python. Ordner sind eine Ebene tief.
- Docker mit PostgreSQL wurde lokal gestartet und geprüft. Echter Google-Login
  benötigt deine OAuth-Zugangsdaten und eine registrierte Redirect-URL.

Weitere Prüfergebnisse: [docs/VALIDATION.md](docs/VALIDATION.md).
