# Ex Libris

A personal reading catalogue — a small, private-ish alternative to Goodreads.

A single static page backed by `books.json`. No tracking, no analytics, no accounts, no
server. It is marked `noindex` and `robots.txt` disallows crawlers, so it should not turn
up in search results. Anyone with the link can read it; only you can change it.

## Where the data comes from

The source of truth is a personal Obsidian vault, which is **not** in this repo and is
never pushed. Each book is a note there. This repo only receives generated metadata —
title, author, series, publisher, year, pages, ISBN, format, shelf, rating and read dates.
Note bodies are never exported.

## Editing from the site

Click **Edit** and paste a GitHub fine-grained personal access token. Create one at
<https://github.com/settings/personal-access-tokens/new> with:

- **Repository access** → Only select repositories → this repo
- **Permissions** → Repository permissions → **Contents: Read and write**

Nothing else. The token is stored in that browser's `localStorage` only, is never
committed, and can be revoked at any time from GitHub settings. Repeat once per device.

With editing on you can add books (searching Open Library), change a book's shelf, rate it,
and set start and finish dates. Each change commits straight to `books.json` through the
GitHub API. Concurrent edits are handled: if the file changed underneath you, the app
re-reads and retries.

On a phone, use *Add to Home Screen* — it installs as a standalone app.

## Keeping the vault in step

Edits made on the site live in `books.json` until you pull them back into the vault:

```
cd ~/Developer/bookshelf && ./publish.sh
```

That does three things in order, and the order matters:

1. `sync_bookshelf.py --apply` — copies shelf, rating and dates from `books.json` into the
   matching notes, and creates notes for books added on the site.
2. `build_bookshelf.py` — regenerates `books.json` from the vault.
3. commit and push.

Running the rebuild *first* would overwrite anything logged on your phone. The site owns
`status`, `rating`, `date_started` and `date_read`; the vault owns everything else.

Removing a book on the site drops it from `books.json` but does **not** delete its note;
the sync reports the discrepancy and leaves the note alone.
