# Lokale Instanz und GitHub Pages

UwUgramm kann als vollständige Cloud-Instanz oder als rein lokaler Editor gebaut
werden. Der lokale Modus benötigt weder Google-Zugangsdaten noch API, Datenbank
oder Migrationen. Projekte und Ordner liegen im Browser-Speicher. JSON-Export
und -Import übertragen Projekte zwischen Geräten oder Browsern; die
Cloud-Freigabe per Code ist in diesem Modus ausgeblendet.

## Statischer Build

Im Projektverzeichnis:

```powershell
cd frontend
npm ci
npm run build:static
```

`frontend/dist` kann auf einem beliebigen statischen Webserver bereitgestellt
werden. Für einen Unterpfad wie bei GitHub Pages:

```powershell
npm run build:static -- --base /UwUgramm/
```

Der Modus ist eine Einstellung der jeweiligen Build-Instanz:
`VITE_APP_MODE=local` deaktiviert die Cloud-Funktionen. `build:static` wählt diesen
Modus automatisch und bereitet die benötigten Python-Dateien vor.
`VITE_APP_MODE=cloud` oder der normale `npm run build` nutzt die bestehende API.
`VITE_BASE_PATH` setzt alternativ den Hosting-Unterpfad. Diese Vite-Variablen
sind öffentliche Build-Konfiguration; Zugangsdaten gehören dort nicht hinein.

Python-Import und validierter Export verwenden denselben Parser und dieselben
Schemas wie das Backend. Pyodide stellt dafür Python/WebAssembly in einem
separaten Web Worker bereit. Eingaben werden ausschließlich geparst und
kompiliert; der eingereichte Python-Code wird nicht ausgeführt. Text-, Knoten-
und Verschachtelungsgrenzen bleiben erhalten. Ein Zeitlimit beendet einen
festhängenden Worker, während der letzte gültige Diagrammstand erhalten bleibt.

Die Laufzeit und alle benötigten Pakete werden mit der Website ausgeliefert.
Erst beim Build werden fünf Pakete heruntergeladen und gegen die SHA256-Werte
der gepinnten Pyodide-Lockdatei geprüft. Im Browser gibt es keine CDN-Abhängigkeit
und keine API-Anfragen. Die rund 15 MB Python-Laufzeit wird bei der ersten
Python-Konvertierung geladen; Diagrammbearbeitung und lokales Speichern
funktionieren bereits davor. Eine spätere Aktualisierung von Pyodide kann die
Paketanzahl und Größe verändern.

## Instanz mit ausschließlich einem Container

```powershell
docker compose -f compose.static.yaml up -d --build
```

Diese unabhängige Compose-Datei startet ausschließlich den Webserver unter
`http://127.0.0.1:8080`. Sie liest keine `.env`, verbindet sich mit keiner Datenbank
und startet keinen API- oder Migrationsdienst. Der Port kann bei gleichzeitigem
Betrieb anderer Instanzen in der Compose-Datei angepasst werden.

Die bestehende `compose.yaml` bleibt der Einstieg für eine Cloud-Instanz mit
PostgreSQL und optionaler Google-Anmeldung. Bei ausschließlich deaktivierter
Google-Anmeldung können `GOOGLE_CLIENT_ID` und `GOOGLE_CLIENT_SECRET` leer bleiben;
für eine Instanz ohne API und Datenbank wird stattdessen der lokale Modus verwendet.

## GitHub Pages

Die öffentliche Instanz liegt unter
<https://hartmannlight.github.io/UwUgramm/>.

Der neue CI-Job `static-site` prüft die produktive App mit Chromium unter einem
Projekt-Unterpfad. Er testet lokale Persistenz, Python-Konvertierung, Download,
Fehlerbehandlung und Grafiken und blockiert dabei alle API- und fremden Requests.
Danach speichert er den statischen Build als Workflow-Artefakt.

`.github/workflows/pages.yml` veröffentlicht genau dieses Artefakt nach einem
erfolgreichen `Container release` auf `main`. Es wird nur der aktuellste
Hauptbranch-Commit veröffentlicht. Pages wird im Repository auf GitHub Actions
als Veröffentlichungsquelle eingestellt. Das bestehende `ci-gate` verlangt auch
den neuen Browser-Test; die Cloud-Instanz wird weiterhin separat geprüft.

Browser-Daten sind an die Origin gebunden, nicht an den URL-Unterpfad. Projekte
anderer UwUgramm-Instanzen auf derselben Domain können deshalb denselben
Browser-Speicher verwenden. Regelmäßiger JSON-Export schützt vor gelöschten
Browserdaten oder einem Gerätewechsel.
