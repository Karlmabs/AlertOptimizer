#!/usr/bin/env bash
# Launch the FastAPI backend using the project venv.
set -e
cd "$(dirname "$0")"
VENV_PY="$(cd ../../../ && pwd)/venv/bin/python"
exec "$VENV_PY" -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
