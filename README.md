# Bookshelf

A personal reading catalogue — a small, private-ish alternative to Goodreads.

The site is a single static page backed by `books.json`. There is no tracking, no
analytics, no accounts, and no server. It is marked `noindex` and `robots.txt`
disallows crawlers, so it should not surface in search results.

## Where the data comes from

The source of truth is a personal Obsidian vault, which is **not** in this repo and is
never pushed. Each book is a note there; this repo only ever receives generated
metadata — title, author, series, publisher, year, pages, ISBN, format, shelf, rating
and read dates. Note bodies are never exported.

## Updating

From the vault:

```
python3 _System/scripts/build_bookshelf.py    # regenerate books.json
cd ~/Developer/bookshelf && ./publish.sh      # commit and push
```

Editing a book means editing its note in Obsidian — change `status:` to `read`, add a
`rating:` and a `date_read:` — then rebuild.
