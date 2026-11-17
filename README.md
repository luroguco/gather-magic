# MTGA Collection Explorer

Local-first MTG Arena collection explorer and deck builder.

## Stack

- React + Vite frontend
- modular Fastify API
- SQLite local database
- versioned shared wire contracts
- Canonical Arena catalog sync from Scryfall bulk data

## What It Does

- Reads the running MTG Arena collection through the free Untapped Companion app, then previews every change before replacing the current ownership snapshot
- Keeps Arena CSV, JSON upload, and the experimental native reader available as fallback paths
- Indexes official keyword mechanics plus derived deckbuilding tags
- Searches by text, mechanics, colors, types, rarity, mana value, format, and owned-only state
- Offers an opt-in, non-default `Coach Beta` that turns the local collection into up to three deterministic Standard or Brawl starting drafts within per-rarity wildcard limits
- Saves decks, validates Arena format rules, and exports Arena deck text
- Preserves imported collection data across later catalog refreshes

## Commands

From the project root:

```bash
npm install
npm run db:sync
npm run dev
```

Useful alternatives:

```bash
npm run build
npm run test
npm run verify
npm run start
```

`npm run verify` runs source-hygiene checks, type checking, all workspace tests, and production builds.

## Data Flow

1. Open MTG Arena and the free Untapped Companion app, then use `Collection` → `Sync collection`.
2. Collection sync first refreshes the canonical Scryfall catalog in `data/mtga.sqlite`, then reads and previews your Arena collection against that catalog.
3. The first run may restart Companion once to enable a loopback-only local bridge. Reconnect Arena if it was disconnected, then sync again.
4. Review the proposed changes and confirm the update. Nothing is replaced during capture or preview.
5. The app overlays owned counts onto the local card catalog.
6. Use `Search` to filter cards and add them into saved decks.
7. Optionally use `Coach Beta` to choose, review, tune, and explicitly save a collection-fit starting draft.
8. Use `Decks` to validate and export Arena deck text.

`npm run db:sync` remains available when you want to refresh the catalog without syncing a collection.

## Notes

- If a collection row cannot be matched to the canonical catalog yet, it is still stored as a local placeholder card so ownership totals are preserved. Those rows are also reported back as unresolved.
- After upgrading, a fresh `npm run db:sync` improves Coach estimates with per-print rarity and nonbasic produced-mana metadata.
- The API binds to `127.0.0.1` by default and accepts only the local Vite development origins. Override this deliberately with `HOST`, `ALLOWED_API_HOSTS`, and `ALLOWED_API_ORIGINS`.
- Direct Arena capture is enabled by default when the API is bound to loopback. Set `ENABLE_DIRECT_CAPTURE=0` to disable it. A non-loopback server keeps capture disabled unless `ENABLE_DIRECT_CAPTURE=1` is set explicitly.
- The default personal workflow calls the already-installed free Companion app locally. It does not require Untapped Premium, an Untapped export, or Arena credentials.
- The bridge launches Companion with an ephemeral loopback-only debugging port and stores the captured map atomically with owner-only permissions. The review confirmation is bound to that exact capture hash.
- This workflow still depends on Untapped Companion's current renderer IPC contract and local native reader. It is appropriate for this trusted personal workspace, but it is not a distributable first-party collector.
- Set `MTGA_DATA_DIR` to place SQLite and collector data in an application-data directory when embedding the API in a desktop controller.
- The current workspace was verified against `Kodo Collection.csv`, which imported `4010` owned copies across `1484` stored cards, with `70` rows still flagged as unresolved canonical matches.

See [docs/COLLECTION_COACH.md](docs/COLLECTION_COACH.md) for Coach's scope and beta quality gate, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for module boundaries, trust boundaries, and collector release gates.
