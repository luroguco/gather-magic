# MTGA Collection Explorer

Local-first MTG Arena collection explorer and deck builder.

## Stack

- React + Vite frontend
- Fastify API
- SQLite local database
- Canonical Arena catalog sync from Scryfall bulk data

## What It Does

- Imports an MTG Arena collection CSV and replaces the current ownership snapshot
- Indexes official keyword mechanics plus derived deckbuilding tags
- Searches by text, mechanics, colors, types, rarity, mana value, format, and owned-only state
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
npm run start
```

## Data Flow

1. `npm run db:sync` downloads the canonical card catalog and stores Arena card data in `data/mtga.sqlite`.
2. Use the `Import` tab to upload an MTG Arena collection export CSV.
3. The app overlays owned counts onto the local card catalog.
4. Use `Search` to filter cards and add them into saved decks.
5. Use `Decks` to validate and export Arena deck text.

## Notes

- If a collection row cannot be matched to the canonical catalog yet, it is still stored as a local placeholder card so ownership totals are preserved. Those rows are also reported back as unresolved.
- The current workspace was verified against `Kodo Collection.csv`, which imported `4010` owned copies across `1484` stored cards, with `70` rows still flagged as unresolved canonical matches.
