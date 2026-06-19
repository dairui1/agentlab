#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

python3 scripts/sync_sources.py

if git diff --quiet -- generated/source-sync-manifest.json; then
  echo "No source manifest changes."
  exit 0
fi

git add generated/source-sync-manifest.json
git commit -m "Refresh source sync manifest"
git push
