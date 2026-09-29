# Lokale Entwicklung

Node.js 24 und Python 3.12+ mit `uv`. Standardports sind **5193** (Web) und **8013** (API).
SQLite wird ausschlieÃŸlich fÃ¼r eine lokale Vorschau und schnelle Tests verwendet;
die Docker-Konfiguration verwendet PostgreSQL.

```bash
# Terminal 1, Linux/macOS
cd backend
uv sync
mkdir -p .local
export DATABASE_URL=sqlite+aiosqlite:///./.local/preview.db
export APP_ORIGIN=http://127.0.0.1:5193
export ENVIRONMENT=development
uv run alembic upgrade head
uv run uvicorn app.main:app --host 127.0.0.1 --port 8013 --no-access-log

# Terminal 2
cd frontend
npm ci
npm run dev
```

Unter PowerShell Variablen mit `$env:DATABASE_URL='â€¦'` usw. setzen und das
Verzeichnis mit `New-Item -ItemType Directory -Force .local` anlegen.
Zum lokalen Google-Test muss `http://127.0.0.1:5193/api/auth/callback` als
Redirect-URL registriert sein. Es gibt absichtlich keinen Entwicklungs-Login,
der die Authentifizierung umgeht.

## PrÃ¼fen

Alle Tests, TypprÃ¼fung, FormatprÃ¼fung und der Produktionsbuild lassen sich vom
Projektverzeichnis gemeinsam starten:

```powershell
.\scripts\check.ps1
```

```bash
bash scripts/check.sh
```

Voraussetzung sind die oben installierten Backend- und Frontend-AbhÃ¤ngigkeiten.
Die Skripte brechen beim ersten Fehler ab und verÃ¤ndern keine Anwendungsdaten.
PowerShell verwendet ein separates temporÃ¤res Testverzeichnis unter `backend/.local`.

FÃ¼r gezielte PrÃ¼fungen:

```bash
cd backend
uv run python -m pytest -q
uv run mypy app
uv run ruff check app tests migrations
uv run ruff format --check app tests migrations

cd ../frontend
npm test
npm run build
npm run format:check
npm audit
```

Formatierung anwenden: `uv run ruff format app tests migrations` im Backend und
`npm run format` im Frontend. Details zu den Modulen stehen in
[Projektstruktur](PROJECT_STRUCTURE.md).

Die Tests prÃ¼fen Roundtrips, nicht unterstÃ¼tzte Syntax, niemals ausgefÃ¼hrten Code,
EigentÃ¼mertrennung, CSRF, Snapshot-Kopien, Ablauf/Widerruf, Rate-Limits,
Account-LÃ¶schung, Revisionskonflikte sowie echte JWT-Signatur- und Claim-PrÃ¼fungen
mit einem lokalen TestschlÃ¼ssel (Issuer, Audience, Nonce, Ablauf).
