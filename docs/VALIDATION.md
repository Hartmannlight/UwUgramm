# Prüfergebnisse

## Pipeline-Vorbereitung – 30. September 2026

- **Lokale Prüfungen:** 83 Backend-, 78 Frontend- und acht Release-Tests bestanden;
  mypy, Ruff, Prettier und Produktionsbuild ebenfalls erfolgreich.
- **Workflows:** Alle vier GitHub-Workflows mit actionlint 1.7.12 geprüft.
- **Container:** Beide Digest-gepinnten Images lokal gebaut. Der isolierte
  Produktions-Smoke-Test mit PostgreSQL 17 besteht einschließlich Migrationen,
  statischen Assets, Sicherheitsheadern, Unicode-Roundtrip, Authentifizierung,
  Projekt-CRUD und Versionskonflikten. Der temporäre Stack wurde entfernt.
- **Veröffentlichung:** Ignorierte `.env`, lokale Datenbanken, Compose-Overrides,
  Caches und Build-Artefakte sind vom Git-Index ausgeschlossen.

Die nativen ARM64-Tests, Trivy-Gates und GHCR-Veröffentlichung werden zusätzlich
durch GitHub Actions geprüft; die einzelnen Ausführungen sind dort nachvollziehbar.

## Review-Korrekturen und Aufteilung – 30. September 2026

- **Gemeinsamer Prüflauf:** `scripts/check.ps1` vollständig bestanden:
  83 Backend-Tests, 78 Frontend-Tests, mypy für 20 Backend-Module, Ruff,
  Formatprüfung sowie TypeScript und Vite-Produktionsbuild.
- **Lokale Projekte:** Neue Projekte sind auf 100 lokale Einträge begrenzt.
  Bereits vorhandene Listen mit 101 Einträgen werden ohne Datenverlust geladen.
  Das Limit greift auch bei mehreren Zustandsänderungen in einem React-Batch.
- **Cloud-Rennen:** Upload plus anschließende Bearbeitung bleibt erhalten,
  während die initiale Cloud-Liste noch lädt – auch bei leerem Konto.
  Erfolgreiches verzögertes Löschen erhält neue Projekte, Bearbeitungen und
  die aktuelle Auswahl. Alte Ladeantworten stellen keine gelöschten Projekte
  wieder her und werden nach dem Abmelden ignoriert. Entwürfe werden bereits
  während des initialen Ladens gesichert.
- **Historie:** Undo/Redo bleibt nach der Auslagerung in den Zustands-Reducer
  funktionsfähig und auf das ausgewählte Projekt beschränkt.
- **UTF-8-Prozessgrenze:** Echter API-/Worker-Roundtrip für jeweils 45.744 Zeichen
  mit Umlauten, chinesischen Zeichen und Emojis in 48 Kommentarblöcken bestanden.
  Import und Export verwenden dieselbe Bytegrenze ohne ASCII-Aufblähung.
- **Struktur:** Frontend nach Features gegliedert, Projekt- und Diagrammverträge
  getrennt; Backend-Router und Parser-Prozess aus der App-Komposition ausgelagert.
  HTTP-Pfade, Datenbankschema und Browser-Schlüssel bleiben kompatibel.
- **Dokumentation:** Lokale Links nach Aufteilung von Entwicklung/Betrieb und
  Verschieben der Screenshots geprüft; keine defekten Verweise.

Die API-Tests verwenden weiterhin isolierte SQLite-Testdatenbanken. Docker/PostgreSQL
und echter Google-Login wurden bei dieser Aufteilung nicht erneut geprüft.
Authlib meldet weiterhin eine Deprecation-Warnung in seiner HTTPX-Kompatibilitätsschicht;
alle Tests bestehen.

## Bisherige Funktionsprüfung – 29. September 2026

- **Backend:** 80 pytest-Tests bestanden, einschließlich Typalias-Übersetzung,
  typisierter Funktionen und unverändertem Sicherheits-Testumfang. Ruff und mypy
  erneut ohne Befund.
- **Frontend:** 70 Tests bestanden: adaptive Breiten, frühe Strukturerkennung,
  Verlassen leerer Zweige, Hover/Cursor-Markierung, f-Strings, geschützte Typkontexte
  und Vergleichsoperatoren sowie die bestehenden Synchronisations-/Zoomtests.
  TypeScript-Prüfung und Produktionsbuild bestanden.
- **Abhängigkeiten:** npm-Audit nach Aktualisierung des Testwerkzeugs ohne bekannte Befunde.
- **Docker:** Produktionsbuild mit Docker Compose gestartet, PostgreSQL, API und
  Web gesund. Ordner-Migration `0002_project_folders` erfolgreich angewendet.
  Die Vorschau unter `http://127.0.0.1:8080/` verwendet PostgreSQL.
- **Browser:** neues Testprojekt, `if x = 10` + Enter mit Fokus im Ja-Zweig,
  Tab in den Nein-Zweig, `/wh` + Pfeil/Enter, verschachtelte While-Schleife,
  Backspace im leeren Feld, Leeren und Rückgängig überprüft. Fehlerhaftes Python
  sperrt den Diagrammeditor; Korrektur übernimmt automatisch. Anschließende
  Diagrammänderung aktualisiert Python wieder zuverlässig.
- **Neue Layoutprüfung im Browser:** Funktion plus zwei verschachtelte Ifs mit
  langem Text: 1024 px Inhaltsbreite, Aufteilungen 824/200 und 624/200 px.
  Der lange Text hatte 147 px Höhe statt einer überbreiten Einzelzeile. Bei sämtlichen
  Textareas waren Scroll- und sichtbare Maße gleich; kein Text war abgeschnitten.
  Reine Layouttests prüfen zusätzlich acht einseitige Verschachtelungen: 2224 px
  Gesamtbreite statt exponentiellen Wachstums.
- **Neue Bedienungsprüfung:** `if ` erzeugt ohne Enter die Verzweigung und behält
  den Fokus. Enter in leeren Ja-/Nein-Feldern führt nach draußen, wiederholtes Enter
  im leeren Wurzelfeld erzeugt nichts Zusätzliches. Pfeil hoch innerhalb des langen
  Textes bleibt im Feld; in dessen erster Zeile führt es zur Bedingung darüber.
- **Weitere Bedienungsprüfung:** Enter nach einer belegten Nein-Anweisung erzeugt
  einen leeren Schritt. Nochmals Enter entfernt ihn und setzt den Fokus unter das
  If. Klick auf Ja fokussierte die erste Anweisung. Die unteren Blockrahmen bleiben
  auch am Dokumentende geschlossen.
- **Maus und Bereiche im Docker-Browser:** Einen vollständigen If-Block in den
  Nein-Zweig eines anderen If gezogen; Python zeigte die neue Verschachtelung.
  Ein Statement per Mülleimer entfernt und per Rückgängig wiederhergestellt.
  Python per Ziehen von 384 auf 286 px verkleinert; beide Seiten eingeklappt und
  wieder geöffnet. Inhalt und Breite blieben erhalten. Tastaturgrößenänderung
  ebenfalls geprüft. Ein lokaler Ordner und darin ein Projekt wurden angelegt.
- **Neue Konvertierung:** Match mit zwei Fällen, OR-Muster und Default aus Python
  importiert; Do-While aus `while True` mit abschließendem Abbruchtest erkannt.
  Im Diagramm eingegebenes FKZ wurde rechts als float angezeigt. Tests sichern
  nachprüfende Schleifen einschließlich Continue in verschachtelten If-/Case-Zweigen,
  unveränderte Semantik ungeschützter Continues und native Python-Muster ab.
  Abschließend `falls x gleich 10` Zeichen für Zeichen eingegeben: frühe If-Erkennung
  behält den Fokus, die vollständige Bedingung exportiert `if x == 10`.
  Screenshot des geprüften Docker-Editors: [mouse-folders-editor.png](screenshots/mouse-folders-editor.png).
- **Ordner-Sicherheit:** API-Tests prüfen Besitzertrennung beim Lesen, Ändern,
  Löschen und bei Projektzuordnungen, CSRF, Namensgrenzen, idempotentes Anlegen,
  Löschen nur leerer Ordner und Entfernen beim Löschen eines Kontos. Die Migration
  lief zusätzlich auf dem lokalen PostgreSQL-Container. Cloud-UI mit echtem Google-
  Konto wurde mangels OAuth-Zugangsdaten nicht getestet.
- **Typen und Markierung im Browser:** Parameter und Rückgabetyp auf `GZ` geändert,
  dazu `x: GZ = 10`: Python zeigt überall `int`. Cursor auf `x` markierte jeweils
  fünf echte Namensvorkommen in Diagramm und Python. Hover und das Aussparen von
  Zeichenketten und Typangaben sind zusätzlich durch Komponenten-/Parsertests geprüft.
- **Scrollen und Zoom:** Normales Mausrad und proportionale Scrollfläche wurden in
  der vorherigen Runde im Browser geprüft. Strg+Mausrad samt Mausanker und unterdrücktem Browserzoom
  ist zusätzlich durch Ereignistests abgesichert; der kombinierte physische
  Tastatur-/Mausrad-Input ist über das verfügbare Browserwerkzeug nicht auslösbar.
- **Darstellung:** Hell, Dunkel und UwU visuell überprüft. Katze und Kaninchen nutzen
  unterschiedliche Framezeilen, laufende CSS-Animationen und veränderte Positionen.
  Mobile Breite 390 CSS-Pixel: obere Leiste einschließlich Konto vollständig im Bild.
- **Google:** OIDC-PKCE, state/nonce-Erzeugung, ungültiger Callback-State und
  Signatur-/Issuer-/Audience-/Nonce-/Ablaufvalidierung mit lokal signierten Testtokens
  geprüft. Der echte Google-Login benötigt Zugangsdaten und eine registrierte Redirect-URL.

Die Unit-/API-Tests verwenden eine separate SQLite-Datei; die laufende Docker-Vorschau
setzt PostgreSQL ein. Der Testlauf meldet eine Deprecation-Warnung aus Authlibs
HTTPX-Kompatibilitätsschicht; die Tests bestehen. Ein Abhängigkeitsscan ersetzt
keine Sicherheitsprüfung des gesamten Betriebs.
