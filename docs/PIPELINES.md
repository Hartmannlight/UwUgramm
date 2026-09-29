# Pipelines und Container-Releases

Die Workflows folgen den Mustern von `Hartmannlight/PrintHub-ZPL-ll`, `inker`
und `kitchen-ledger`. Container-Build und Scan nutzen die gemeinsamen Actions aus
[`Hartmannlight/pipeline-toolkit`](https://github.com/Hartmannlight/pipeline-toolkit),
fest gepinnt auf einen geprüften Commit. Externe Actions und Docker-Basisimages
sind ebenfalls per Commit bzw. Manifest-Digest fixiert.

## CI

Pull Requests auf `main`, manuelle CI-Läufe und die Release-Pipeline führen
`.github/workflows/ci.yml` aus:

- Backend: Python 3.12 und 3.13, unveränderte uv-Lockdatei, pytest, mypy, Ruff.
- Frontend: Node 24, `npm ci`, Vitest, Prettier, TypeScript und Vite-Build.
- Container: native AMD64- und ARM64-Runner bauen API und Web. Ein temporärer
  Compose-Stack prüft PostgreSQL-Migrationen, statische Assets, HTTP-Sicherheitsheader,
  Unicode-Konvertierung, Authentifizierung, CRUD und optimistische Versionskonflikte.
  Dieser Stack verwendet eigene Volumes, Netze und zufällige Testschlüssel.
- Trivy prüft Source-Abhängigkeiten inklusive Entwicklungswerkzeugen sowie beide
  Runtime-Images. Das gemeinsame Toolkit blockiert behebbares HIGH/CRITICAL und
  HIGH/CRITICAL-Secrets. Unbehobene Schwachstellen bleiben im Bericht sichtbar.
- `ci-gate` ist nur erfolgreich, wenn alle oben genannten Jobs erfolgreich sind.
  Dieser Check eignet sich als Pflichtprüfung für den geschützten Hauptbranch.

Scanberichte und Container-Logs sind 14 Tage verfügbar; die geprüften Image-Archive
werden für zwei Tage als Workflow-Artefakte gespeichert. Secret-Treffer werden vor
dem Hochladen durch den Toolkit-Gate bereinigt.

## Veröffentlichung

Pushes auf `main`, Tags im Format `vMAJOR.MINOR.PATCH` und manuelle Läufe auf diesen
Refs starten `.github/workflows/container-release.yml`. Veröffentlichung beginnt
erst nach erfolgreicher CI. Es werden genau die getesteten Image-Archive geladen;
ein erneuter Build während der Veröffentlichung findet nicht statt.

Images:

- `ghcr.io/hartmannlight/uwugramm-api`
- `ghcr.io/hartmannlight/uwugramm-web`

Pro Architektur entsteht ein unveränderlicher Tag
`sha-<commit>-r<run-id>-<attempt>-<arch>` mit SBOM und Herkunftsnachweis.
Erst nachdem alle vier Plattform-Images veröffentlicht und attestiert wurden,
entstehen die zwei Multiarch-Indizes `sha-<commit>-r<run-id>-<attempt>`.
Beide Indizes müssen erfolgreich sein, bevor `latest` oder der Versionstag
gesetzt wird. `latest` wird nur verschoben, wenn der geprüfte Commit noch die
Spitze von `main` ist. Versionstags müssen aus der `main`-Historie stammen und
dürfen vorhandene Tags nicht überschreiben. Unveränderliche Tags werden ebenfalls
nicht überschrieben; unklare Registry-Fehler stoppen die Veröffentlichung.

Die erstmalige Sichtbarkeit von GHCR-Paketen wird durch GitHub bestimmt. Für
anonyme Image-Downloads muss die Paket-Sichtbarkeit bei GitHub öffentlich sein.
Die Pipeline veröffentlicht Images; ein Server-Deployment erfolgt separat.

## Lokal

```powershell
.\scripts\check.ps1
docker build -t candidate-api:gate backend
docker build -t candidate-web:gate frontend
backend/.venv/Scripts/python.exe scripts/container_smoke.py
```

Unter Linux/macOS: `bash scripts/check.sh` und `python3 scripts/container_smoke.py`.
Der Smoke-Test entfernt nur seinen eigenen temporären Compose-Stack und dessen
Volumes. Er liest keine lokale `.env` und verwendet keine Google-Zugangsdaten.

Renovate übernimmt die gemeinsamen Update-Regeln aus `pipeline-toolkit` für
Actions, Images, Python-/npm-Abhängigkeiten und Lockdateien. Die Renovate-App muss
für dieses Repo freigeschaltet sein. Anwendung und Compose-Datei pinnen direkte
Python-Abhängigkeiten bzw. Images; Updates werden über CI geprüft.
