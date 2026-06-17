#!/usr/bin/env bash
# Update the managed DATABASE_URL block in repo-root .env (idempotent).
# Usage: set-env-database-url.sh <mode> <database_url>
#   mode: local | cloudsql
set -euo pipefail

MODE="${1:?mode required (local|cloudsql)}"
DB_URL="${2:?database_url required}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/../.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"

BEGIN_MARKER="# --- DATABASE_URL (managed by start-dev-*.sh; do not edit) ---"
END_MARKER="# --- end DATABASE_URL ---"

export ENV_FILE BEGIN_MARKER END_MARKER DB_MODE="$MODE" DB_URL
python3 <<'PY'
import os
import re
from pathlib import Path

env_path = Path(os.environ["ENV_FILE"])
begin = os.environ["BEGIN_MARKER"]
end = os.environ["END_MARKER"]
mode = os.environ["DB_MODE"]
db_url = os.environ["DB_URL"]

block = f"{begin}\n# DB_MODE={mode}\nDATABASE_URL={db_url}\n{end}\n"

text = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
lines = text.splitlines(keepends=True)

out: list[str] = []
skipping = False
for line in lines:
    if line.startswith(begin):
        skipping = True
        continue
    if skipping:
        if line.startswith(end):
            skipping = False
        continue
    if re.match(r"^DATABASE_URL=", line):
        continue
    out.append(line)

if out and not out[-1].endswith("\n"):
    out[-1] += "\n"
out.append(block)
env_path.write_text("".join(out), encoding="utf-8")
PY
