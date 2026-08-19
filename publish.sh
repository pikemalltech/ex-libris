#!/bin/sh
# Regenerate books.json from the vault, then commit and push if anything changed.
set -e
VAULT="$HOME/Documents/Zettelkasten"
cd "$(dirname "$0")"
python3 "$VAULT/_System/scripts/build_bookshelf.py" "$PWD"
if git diff --quiet -- books.json && git diff --cached --quiet -- books.json; then
  echo "no changes to publish"
  exit 0
fi
git add -A
git commit -m "Update bookshelf ($(date +%Y-%m-%d))"
git push
echo "published"
