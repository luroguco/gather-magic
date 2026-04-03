# Project Status

## Product Summary

This project is a local-first MTG Arena collection explorer and deck builder.

Core goals:
- import an MTG Arena collection CSV reliably
- search the Arena card pool with more deterministic mechanic filtering than typical public tools
- build and validate decks against owned cards and Arena format rules
- keep the UI usable for direct tinkering without requiring AI

AI planning exists separately in:
- [AI_ASSISTANT_PLAN.md](/Users/luisgutierrez/Documents/Development/Projects/mtg collection/docs/AI_ASSISTANT_PLAN.md)

Collector app planning exists separately in:
- [COLLECTOR_APP_PLAN.md](/Users/luisgutierrez/Documents/Development/Projects/mtg collection/docs/COLLECTOR_APP_PLAN.md)

## Current Stack

- React + Vite frontend
- Fastify backend
- SQLite local database
- Scryfall bulk data as the canonical Arena card source
- TypeScript throughout

## Current Data Flow

1. `npm run db:sync`
   Downloads and syncs canonical Arena-relevant card data into `data/mtga.sqlite`.

2. Collection import
   Uploading an Arena collection CSV replaces the current ownership snapshot.

3. Search
   The UI queries the backend with structured filters for text, colors, types, rarity, mana value, formats, and mechanics.

4. Deck building
   Cards can be added to saved decks, then validated and exported in Arena deck text format.

## Implemented Features

### Backend

- canonical card storage with Arena print mapping
- mechanic indexing
  - official keyword mechanics from oracle data
  - derived deckbuilding tags from deterministic rules
- collection import
  - match by Arena id first
  - fallback match by `name + set`
  - unresolved rows preserved as placeholder cards so owned totals are not lost
- search API
- deck CRUD
- format validation
- Arena export
- owned-only mechanic filtering for the mechanic picker/glossary

### Frontend

- tabs for `Search`, `Decks`, and `Import`
- structured filter UI
- grouped mechanic quick-pick sidebar
- mechanic glossary modal
- selectable/pinnable mechanics
- owned-only-aware mechanic list
- card result tiles with:
  - ownership dots
  - mana cost circles
  - subtle `+Main` / `+Side` / `+Cmdr` actions
- deck editor with validation and export
- collection status summary

## Important Behavior Decisions

### Ownership semantics

The app now distinguishes between:
- `ownedCopies`: raw imported copies
- `owned rows`: CSV rows with owned copies
- `unique names`: distinct card names in collection
- `owned entries`: stored collection entries in the database

This matters because different tools count collections differently.

### Playable ownership display

Search results do not blindly show raw owned copies anymore.

Normal cards:
- capped to a deck-usable count of `4` in the card UI

Unlimited-copy exceptions:
- show `∞`
- keep raw count uncapped

Raw ownership is still retained in the data model.

### Mechanics behavior

- mechanic search itself is deterministic and backend-driven
- when `Owned cards only` is enabled, the mechanic picker hides mechanics with zero owned matches
- some derived mechanics may still have zero catalog hits if the heuristic does not currently match anything

## Verified Current Data State

Using the provided `Kodo Collection.csv`, the current verified imported snapshot is:

- `4010` owned copies
- `2118` owned CSV rows
- `1480` distinct card names
- `1484` stored collection entries
- `1414` canonical matched entries
- `70` unresolved placeholder entries

Current synced catalog state:

- `37012` Arena-relevant cards
- `112641` Arena printings

Mechanic counts after owned-only filtering:

- `748` total indexed mechanics
- `148` mechanics with at least one owned-card match

## Known Limitations

- no running dev server verification was done inside the sandbox because binding the local port failed with `EPERM`
- some derived mechanic heuristics are intentionally rough and can be expanded further
- a few derived tags currently produce zero full-catalog hits
- no auth, sync, or multi-user support
- no AI assistant implementation yet, only the plan

## Recommended Near-Term Work

### UX / Product

- continue refining the search and card-detail experience
- improve mechanic curation further if the glossary still feels too broad
- add stronger deckbuilding workflows such as shortlist, compare, and candidate packages

### Search Quality

- review zero-hit derived mechanics and either improve or remove them
- expand high-value derived tags carefully
- add explainability for why a card matched a derived tag

### AI

- do not start with freeform chat over the raw collection
- implement the grounded query-builder approach described in `docs/AI_ASSISTANT_PLAN.md`

## Key Repo Paths

- frontend app:
  - [App.tsx](/Users/luisgutierrez/Documents/Development/Projects/mtg collection/apps/web/src/App.tsx)
- frontend styling:
  - [styles.css](/Users/luisgutierrez/Documents/Development/Projects/mtg collection/apps/web/src/styles.css)
- backend app:
  - [app.ts](/Users/luisgutierrez/Documents/Development/Projects/mtg collection/apps/api/src/app.ts)
- search and collection summary logic:
  - [cardsRepository.ts](/Users/luisgutierrez/Documents/Development/Projects/mtg collection/apps/api/src/services/cardsRepository.ts)
- collection import:
  - [collectionImport.ts](/Users/luisgutierrez/Documents/Development/Projects/mtg collection/apps/api/src/services/collectionImport.ts)
- mechanic definitions and derived tags:
  - [mechanics.ts](/Users/luisgutierrez/Documents/Development/Projects/mtg collection/apps/api/src/lib/mechanics.ts)
- deck copy rules:
  - [cardCopies.ts](/Users/luisgutierrez/Documents/Development/Projects/mtg collection/apps/api/src/lib/cardCopies.ts)
