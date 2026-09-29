# UwUgramm – Architektur und Interaktion

## Produktentscheidung vor der Implementierung

Ein Arbeitsraum statt einer vorgeschalteten Startseite: links Projekte und Bausteine,
in der Mitte ein direkt editierbares Nassi-Shneiderman-Diagramm, rechts Python.
Weiß startet als Standard. Dunkel und UwU sind gleichwertige, gespeicherte Themes.
Das UwU-Theme erhält eine Katze und ein Kaninchen mit jeweils vier Animationsframes,
einen kurzen Hinweis nach einer Sekunde und einen dezenten periodischen Glanz.
Bewegung ist ausdrücklich eingeschaltet, pausierbar und optional über die Einstellung
„Systemeinstellung“ an `prefers-reduced-motion` gebunden. Keine Animation darf Klicks
oder Tastatureingaben abfangen. Eine gemeinsame obere Leiste ersetzt die bisherigen
Werkzeug- und Erklärungsebenen.

## Bausteine

Die aktuelle Aufteilung der Module und ihre Zuständigkeiten stehen in
[Projektstruktur](PROJECT_STRUCTURE.md). Entwicklungsabläufe sind in
[Lokale Entwicklung](DEVELOPMENT.md), Betriebsfragen in [Deployment](DEPLOYMENT.md)
beschrieben.

- React + TypeScript + Vite: schnelle Oberfläche ohne notwendiges SSR; CodeMirror
  für Python mit Einrückung, Klammerpaaren, Syntaxfarben und Vervollständigung.
- Ein versionierter, rekursiver Diagrammbaum als kanonisches Dokument. Stabile IDs,
  Undo/Redo und unveränderliche Änderungen. Kein HTML und kein ausführbarer Code
  in der Darstellung. Verzweigung, Schleifen und Funktionen besitzen Kindsequenzen.
- FastAPI: Google OIDC, Projektverwaltung, Freigaben und Python-Konvertierung.
  Die Konvertierung verwendet Pythons `ast`, niemals `exec` oder `eval`.
- PostgreSQL + SQLAlchemy + Alembic: Benutzer, Sitzungen, Projekte, Freigabe-Snapshots
  und kurzlebige Rate-Limits. Ein modularer Monolith reicht; keine Microservices.
- Docker Compose: statisches Frontend mit Nginx als Same-Origin-Proxy, API,
  Migration und PostgreSQL. TLS wird am vorhandenen Reverse Proxy terminiert.

## Tastaturmodell

`editing.ts` kapselt die Struktur- und Fokusentscheidungen unabhängig von React.
`if `, `while ` und `for ` werden während des Tippens erkannt. Die Umwandlung erhält
Cursor und Fokus; ähnliche Variablennamen wie `if_count` bleiben Anweisungen.
Enter erkennt außerdem `def` und wechselt bei Containern zum ersten Kind.
Sonst ergänzt Enter die nächste Anweisung. Leeres Ja + Enter wechselt zu Nein,
leeres Nein + Enter hinter das If, eine leere Schleifenzeile hinter die Schleife.
Leere Anweisungen im verlassenen Zweig werden entfernt; vorhandener Inhalt bleibt erhalten.
Im leeren Wurzelfeld entstehen durch Enter keine weiteren Leerfelder. Tab wechselt zwischen
Ja, Nein und der nächsten Anweisung hinter der Bedingung; Shift+Tab rückwärts.
Alt+Enter verlässt den aktuellen Container. Backspace entfernt einen leeren Block,
aber niemals einen Container mit Inhalt. Pfeile navigieren, Alt+Pfeile verschieben.
Slash-Suche bleibt im Feld und erlaubt Tippen, Pfeile, Enter und Tab; Snippets
markieren direkt den auszufüllenden Platzhalter. Escape verlässt die Textbearbeitung.
Native Buttons und Dialoge bleiben per Tastatur erreichbar. Strg+S speichert.

Die schraffierten Griffe nutzen Pointer Capture für Maus und Touch. Das Ziel wird
aus der tatsächlich getroffenen Sequenz und der vertikalen Blockmitte ermittelt.
Eine Bewegung verschiebt den ganzen Teilbaum unter Beibehaltung der IDs;
ein Ziel innerhalb des eigenen Teilbaums wird verworfen. Grenzen und Baumvertrag
werden vor dem Übernehmen erneut geprüft. Jede Bewegung und Blocklöschung bleibt
über die bestehende Dokumenthistorie rückgängig machbar.

`usePanels` speichert Sichtbarkeit sowie Desktopbreite und mobile Höhe lokal.
Ein ResizeObserver begrenzt den Bereich anhand des vorhandenen Platzes.
Die Trennlinie unterstützt Pointer Capture und native Tastaturbedienung.

`layout.ts` berechnet zuerst gewünschte Breiten von unten nach oben und verteilt dann
den verfügbaren Platz von oben nach unten. Grundbreite: 600 px, Zweigminimum: 200 px.
Textfelder sind auf ungefähr 70 Zeichen bzw. 588 px Textbreite begrenzt und wachsen
bei weichen Umbrüchen in der Höhe. Eine symmetrische If-Aufteilung bleibt bis
1.200 px erhalten; darüber richtet sich die Breite beider Zweige nach dem Inhalt.
Die Dreiecksspitze und das Spaltenraster nutzen dieselbe berechnete Teilung.
Einseitige Verschachtelungen wachsen dadurch linear statt exponentiell.

Native Textareas und eine identisch gesetzte Textebene bieten weiche Umbrüche,
Textauswahl und hervorgehobene Namen ohne Änderungen am gespeicherten Quelltext.
Pfeiltasten navigieren innerhalb mehrzeiliger Felder und wechseln erst an deren
erster/letzter sichtbarer Zeile den Block. Lezers Python-Parser erkennt Bezeichner,
auch in f-Strings, und schließt Kommentare, reine Zeichenketten, Eigenschaften und
Typangaben aus. Cursor und Hover steuern eine gemeinsame Namensmarkierung in beiden
Editoren. Die Markierung vergleicht Namen, nicht deren semantischen Gültigkeitsbereich.

Ein ResizeObserver misst das unskalierte Dokument; eine separate Fläche hält die
Scrollmaße synchron zur Zoomstufe. `useCanvasZoom` verarbeitet nur Strg-/Meta-Mausrad
als Zoom und hält den Punkt unter dem Mauszeiger fest. Normales Mausrad bleibt natives
Scrollen. Alle Diagrammtexte verwenden dieselbe Grundschriftgröße. Einfügelinien
haben keine eigene Höhe; ihr Plus wird ausschließlich beim Hover sichtbar.
Schleifen umfassen ihren Inhalt oben, links und unten mit einem durchgehenden Rahmen,
entsprechend der [Nassi-Shneiderman-Darstellung der TU Darmstadt](https://www.iim.maschinenbau.tu-darmstadt.de/kursunterlagen_archiv/ikt_ws1415/03/Theorie/nassishneidermandiagramm.html).

Funktionen haben einen eigenen Rahmen mit Name, Parameterliste und Rückgabetyp;
die Tastaturreihenfolge ist Name → Parameter → Rückgabetyp → Körper. Diese Felder
werden aus der bestehenden Signatur in `node.text` abgeleitet und dorthin zurückgeschrieben.
Dokumentversion und API-Schema bleiben kompatibel. Eine fehlende Rückgabeannotation
wird nicht stillschweigend zu `None`; explizites `void` wird dagegen als `None` exportiert.
Die Trennung orientiert sich am [Funktionskopf im offiziellen Structorizer-Handbuch](https://help.structorizer.fisch.lu/index.php?menu=75).
Die [offizielle DIN-66261-Seite](https://www.dinmedia.de/de/norm/din-66261/1255956)
bestätigt den Bezug zu Nassi-Shneiderman-Sinnbildern, stellt aber den vollständigen
Normtext nicht frei bereit. Eine vollständige DIN-Konformitätsprüfung oder eine
DIN-Pflicht zu genau diesen drei Feldern wird daher nicht behauptet.

## Speicherung und Konflikte

Ohne Anmeldung sind Projekte ausdrücklich lokal in diesem Browser. Änderungen
werden automatisch gesichert. Mit Google ist ein bewusstes Speichern in der Cloud
möglich; danach werden Änderungen automatisch synchronisiert. Eine Revisionsnummer
verhindert verlorene Änderungen zwischen Tabs/Geräten (HTTP 409 statt Überschreiben).
Ein lokaler Entwurf bleibt bei Netzwerkfehlern im Tab-Speicher erhalten. Cloud-Daten werden nicht
automatisch als Browser-Projekt archiviert; Anmeldung ist kein Versprechen von
Anonymität. Projekttexte können selbst personenbezogene Inhalte enthalten.

Ordner besitzen wie Projekte einen Besitzer. Die Migration `0002_project_folders`
ergänzt Ordner und eine nullable Projektzuordnung; vorhandene Projekte behalten
ihren Inhalt. API-Lese- und Schreibzugriffe prüfen den Sitzungsbesitzer, auch beim
Zuordnen eines Projekts. Ordner mit Projekten dürfen nicht gelöscht werden.
Lokale Ordner werden beim ersten Cloud-Speichern idempotent angelegt. Account-
Löschung entfernt auch dessen Ordner. Gemeinsame Freigaben enthalten nur das
Diagramm und übernehmen keine Ordnerstruktur.

## Sicherheit und Datenminimierung

OIDC Authorization Code mit PKCE, state und nonce über Authlib; nur Scope `openid`.
Signatur, Issuer, Audience, Ablauf und Nonce des ID-Tokens werden geprüft. Persistiert
wird nur ein HMAC der Google-Subject-ID und eine zufällige interne Benutzer-ID.
Auch diese Zuordnung ist ein pseudonymes personenbezogenes Datum, nicht anonym.
Keine Google-Zugriffs-/Refresh-Tokens, E-Mail, Namen oder Avatare in der Datenbank.

Opake zufällige Sitzungen: nur Hash in PostgreSQL, HttpOnly/SameSite=Lax, in Produktion
Secure und `__Host-`-Cookie. CSRF-Token plus Origin-Prüfung für Änderungen.
Besitzerprüfung auf jeder Projekt-/Freigabeoperation; keine Client-Benutzer-IDs.
Pydantic-Dokumentlimits, Request-Body-Limit, maximale Baumtiefe/Knotenanzahl,
Parser-Zeitlimit und eigener Parser-Prozess verhindern triviale Ressourcenangriffe.
Kein beliebiger Python-Code wird ausgeführt.

Freigaben: zufällige acht Zeichen (ohne verwechslungsanfällige Zeichen), nur Hash
gespeichert, Snapshot ohne Besitzerinformationen, 24 Stunden gültig, widerrufbar.
Ein Code ist ein zeitlich begrenztes Leserecht: wer ihn kennt, kann eine eigene Kopie
erstellen. Es gibt keine öffentliche Liste/Suche. Rate-Limits liegen in PostgreSQL,
funktionieren über Worker hinweg und verwenden kurzlebige HMAC-Schlüssel.
Nginx liefert nur normalisierte Request-Pfade ohne OAuth-Queries; keine Access-Logs
mit IP, Cookies, Codes, Projekttexten oder Google-Daten.

## Python-Vertrag

`language.ts` und `app/conversion/type_names.py` übersetzen dokumentierte deutsche Typkürzel
ausschließlich in Typannotation-Kontexten. Funktionen, Parameter, Rückgabetypen und
verschachtelte Container werden berücksichtigt. Unbekannte oder qualifizierte Typnamen,
Strings, Default-Ausdrücke, `Literal`-Werte und `Annotated`-Metadaten bleiben erhalten.
Frontend-Vorschau und serverseitiger Export werden mit denselben Fallklassen getestet.
In Bedingungen wird ein einzelnes `=` zu `==`; `≤`, `≥` und `≠` werden zu Python-Operatoren.
Tokenisierung schützt Stringinhalte, benannte Aufrufargumente und `:=` vor Änderungen.
Das ist keine Typprüfung und keine Codeausführung.

`usePythonSync` verwaltet pro geöffnetem Projekt einen Python-Puffer mit Zuständen
`pending`, `valid` oder `error`. Nach 450 ms Schreibpause wird konvertiert. Während
ungültiger oder ungeprüfter Eingaben ist der Diagrammeditor gesperrt. Projekt-ID,
Dokumentreferenz und Anfragesequenz verhindern, dass verspätete Antworten neuere
Arbeit überschreiben. Gültiger Import aktualisiert den gemeinsamen Baum. Sobald der
Baum erneut editiert wird, wird Python wieder daraus erzeugt. Ein leerer Python-Puffer
leert das Diagramm ohne Serveranfrage. Ungeprüfte Puffer bleiben bei Projektwechseln
im Arbeitsspeicher erhalten; beim Schließen warnt der Browser. Sie werden nicht als
gültiges Cloud-Dokument gespeichert und sind nach einem erzwungenen Reload verloren.

Leere Diagrammfelder erzeugen keine einzelnen `pass`-Zeilen. Nur in leeren oder rein
kommentierten Python-Suites wird genau ein `pass` ergänzt. Importierte `pass`-Anweisungen
werden als leere editierbare Felder normalisiert. Ein sonst leerer Nein-Zweig erzeugt
kein unnötiges `else: pass`.

Unterstützt: einfache Anweisungen, if/elif/else, match/case, for, while, Funktionen, return,
break, continue, Kommentare und leere Sequenzen. Der Import arbeitet syntaktisch,
nicht durch Ausführung. Nicht unterstützte Compound-Statements (z. B. try, with,
class und async) werden mit Zeile gemeldet, niemals stillschweigend entfernt.
Code wird beim Export normalisiert; exakte Formatierung ist kein Roundtrip-Ziel.
Kommentare innerhalb zusammengesetzter Ausdrücke und Inline-Kommentare können nicht
positionsgetreu erhalten bleiben; darüber informiert der Import ausdrücklich.

Mehrfachauswahl speichert `case`-Knoten ausschließlich direkt im Switch-Körper;
der Sonst-Zweig bleibt eine normale Anweisungssequenz. Beide Validatoren erzwingen
diese Form. Python nutzt strukturelles Pattern Matching ohne Fallthrough.
`dowhile` und `repeat` speichern eine Bedingung am unteren Rahmen. Beim Export
erhalten sie einen abschließenden Test in `while True`; Continue in If-/Case-Zweigen
bekommt denselben Test vorangestellt. Verschachtelte Schleifen haben ihren eigenen
Continue-Kontext. Beim Import werden nur passende Test-/Continue-Paare entfernt;
ungeschützte Continues behalten die ursprüngliche While-Struktur und Semantik.

Weitere kontextbezogene Übersetzungen sind im README dokumentiert. Die
[Abitur-Formelsammlung Baden-Württemberg](https://www.schule-bw.de/faecher-und-schularten/berufliche-schularten/berufliches-gymnasium-oberstufe/musterpruefungsaufgaben-neue-bildungsplaene-abitur-2024/formelsammlung-it.pdf)
dient als Referenz für GZ/FKZ, logische Wörter und deutsche Kontrollschreibweisen.
Das ist keine vollständige Interpretation beliebiger deutscher Pseudocode-Dateien.

## Prüfung und Betrieb

Tests für Python-Roundtrips, Ablehnung nicht unterstützter Konstrukte,
Eigentümertrennung, CSRF, abgelaufene/widerrufene Freigaben und Revisionskonflikte.
TypeScript-Prüfung und Produktionsbuild, anschließend UI-Prüfung von Tastatur,
Themes und responsiver Darstellung. Google muss zusätzlich mit echten Credentials
und registrierter Redirect-URL geprüft werden; Mock-Tests ersetzen das nicht.

Quellen: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect),
[OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html),
[Python AST](https://docs.python.org/3/library/ast.html).
