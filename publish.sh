#!/bin/sh
# Round-trip the shelf: pull anything logged on the site back into the vault, rebuild
# books.json from the vault, then push.
#
# Order matters. The vault is the source of truth, so a rebuild would overwrite edits
# made on the phone unless those are synced into the notes first.
set -e
VAULT="$HOME/Documents/Zettelkasten"
cd "$(dirname "$0")"

git pull --quiet --rebase origin main || true

echo "1/3  syncing site edits into the vault"
python3 "$VAULT/_System/scripts/sync_bookshelf.py" --apply "$PWD"

echo "2/3  rebuilding books.json from the vault"
python3 "$VAULT/_System/scripts/build_bookshelf.py" "$PWD"

echo "3/3  publishing"
if git diff --quiet && git diff --cached --quiet; then
  echo "     nothing changed"
  exit 0
fi
git add -A
git commit -q -m "Update bookshelf ($(date +%Y-%m-%d))"
git push -q
echo "     pushed"
