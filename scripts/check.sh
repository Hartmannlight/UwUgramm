#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$project_root/backend"
uv run --frozen python -m pytest -q
uv run --frozen mypy app
uv run --frozen ruff check --config pyproject.toml app tests migrations ../scripts
uv run --frozen ruff format --config pyproject.toml --check app tests migrations ../scripts
uv run --frozen python -m unittest discover -s ../scripts/tests -v

cd "$project_root/frontend"
npm test
npm run format:check
npm run build
