# Collection Coach Beta

Collection Coach is an opt-in deck-starting workflow built around one promise:

> Show me up to three understandable, collection-fit starting decks within my chosen wildcard limits.

Coach produces legal starting drafts, not claims about competitive or optimized decks. It is additive and non-default while recommendation quality is being evaluated; Search, Stats, Decks, and Collection remain directly available.

## User Flow

Coach deliberately uses a short **Choose → Review/save** flow.

### 1. Choose

- Select **Standard BO1** or **Brawl**.
- Start in **Owned only**, which sends a zero wildcard budget.
- Turn off Owned only to set exact per-brew Common, Uncommon, Rare, and Mythic limits. These limits are not the player's live Arena balances.
- Optionally choose one owned anchor for Standard.
- For Brawl, ask Coach to suggest a commander or choose an owned commander to build around.
- Generate up to three qualifying ideas. Coach returns fewer when it cannot build three complete, legal drafts within the constraints.
- Each idea includes a one-sentence plan, as many as three owned anchors, estimated wildcard use, collection fit, grounded feature evidence, and collection/catalog freshness.
- **Skip** excludes an idea fingerprint and looks for another qualifying concept; the last skip can be undone.

### 2. Review and save

Coach generates the exact list only after an idea is opened. Cards are grouped into **Core plan**, **Support**, **Interaction**, and **Mana**, with at most three concerns and three replacement suggestions.

- **Use this draft** saves it through the existing local deck service.
- **Tune this deck** can exclude an off-theme card, lock a suggested replacement, rebuild the whole prototype, and undo the last local constraint change.
- **Save and edit** saves the deck and opens the existing advanced editor.
- **Why this list** starts with up to three named card-to-card synergies from the actual draft. Collection coverage, wildcard caveats, feature-rule version, and source timestamps remain available under **Data and assumptions**.

Coach does not save, overwrite, export, or craft anything without an explicit user action. Browser-local preferences hold the current budget, anchor, skipped ideas, and tuning history; a saved deck is the durable boundary.

## Deterministic, Local-Only Scope

After the Arena card catalog has been synced, idea generation and prototype construction run against the local SQLite catalog and collection snapshot. Coach does not call an AI model, metagame service, match-history provider, or remote recommendation system.

A versioned, pure feature classifier derives high-confidence themes and structural roles from existing card text, keywords, mechanics, types, and mana value. The first theme set is:

- Tokens
- +1/+1 counters
- Sacrifice
- Graveyard value
- Blink/ETB
- Lifegain
- Landfall
- Typal, only when explicit payoffs exist

Legality, color identity, copy limits, ownership, and every rarity budget are hard gates. Qualifying drafts then prefer owned coverage, fewer Rare/Mythic crafts, and visible diversity by theme and color. Inputs and tie-breaking are deterministic so the same source data and constraints can be reproduced.

## Starting Structures

The structures are balanced scaffolds, not assertions about an optimal archetype.

### Standard BO1

Coach supports mono-color and two-color ideas and creates exactly 60 main-deck cards with no sideboard.

| Profile | Lands | Enablers | Payoffs / threats | Interaction | Draw / selection |
|---|---:|---:|---:|---:|---:|
| Proactive | 23 | 16 | 12 | 6 | 3 |
| Value | 25 | 12 | 10 | 8 | 5 |

Every generated list must also pass profile-specific curve and basic color-source guardrails plus the same shared Standard validator used by saved decks.

### Brawl

Brawl uses a separate commander-first path rather than the Standard generator with singleton mode enabled.

| Component | Cards |
|---|---:|
| Commander | 1 |
| Lands | 38 |
| Ramp / fixing | 10 |
| Interaction | 10 |
| Draw / selection | 8 |
| Protection / recursion | 3 |
| Commander / theme cards | 30 |

The resulting 99+1 list must pass commander eligibility, color-identity, singleton and explicit-copy exceptions, Arena legality, ownership, wildcard-cap, and no-sideboard checks. Commander-aware minimums require a credible mix of enablers and payoffs before the 30 theme slots can be reported as theme density. Standard Brawl remains a distinct 59+1 format in the shared rule service and is not silently treated as casual 100-card Brawl.

## Wildcard Estimates

Wildcard limits are exact per-rarity caps for one generated draft. Coach compares required copies with locally imported ownership, aggregates copy rules and ownership across printings and deck sections, treats basic lands as free, and uses the lowest known Arena printing rarity when alternate printings exist.

The result is still an estimate. The app cannot observe the player's current wildcard balances, the live Arena crafting screen, or every real-time craftability condition. Unknown-rarity, placeholder, or insufficiently grounded unowned cards are not used to fill budgeted drafts. Review Arena before spending wildcards.

A fresh `npm run db:sync` is recommended after upgrading. It fills the per-print rarity and nonbasic produced-mana metadata that improves wildcard and mana-base estimates; migrations provide safe fallbacks for older databases.

## Source Fingerprints and Stale Results

Every idea and prototype response carries a `SourceFingerprint` with:

- collection import ID and import timestamp
- catalog sync timestamp
- feature-classifier version
- data fingerprint
- constraint fingerprint

The prototype request sends the source fingerprint returned with the idea set. If the collection, catalog, or feature version changed in between, the API returns HTTP `409` with code `SOURCE_CHANGED`. The UI discards the stale path, refreshes the ideas, and requires a newly validated prototype before save. No recommendation history or resumable workbench is persisted on the server.

## API

### `POST /api/coach/ideas`

Accepts:

- `format`: `standard` or `brawl`
- `craftBudget`: exact `common`, `uncommon`, `rare`, and `mythic` caps
- optional `anchorCardId` or `commanderCardId`
- excluded idea and constraint fingerprints used by Skip/undo

Returns zero to three idea summaries, source metadata, generation time, and diagnostics explaining why fewer than three complete results qualified.

### `POST /api/coach/prototype`

Accepts:

- selected `ideaId` and format
- the same per-rarity budget
- the source fingerprint from the idea response
- optional locked cards and excluded card IDs

Returns the exact deck, grouped explanation, craft gaps, role coverage, Brawl theme density, up to three concerns and replacements, and structured shared-rule validation. It returns `409 SOURCE_CHANGED` for stale source data, `404 IDEA_NOT_FOUND` when a concept cannot be reconstructed, and `422 INFEASIBLE_CONSTRAINTS` when tuning choices cannot produce a complete legal list.

Saving continues through the existing deck API; Coach does not introduce a second durable deck store.

## Beta Quality Gate

Automated legality and generator-invariant tests are necessary, but they do not prove recommendation quality. Coach must remain non-default until the deferred manual gate is completed:

- Review at least 20 Standard prototypes, followed by 20 Brawl prototypes.
- At least 80% must pass a rubric for understandable plan, credible enabler/payoff relationship, acceptable filler, plausible mana, and accurate explanation.
- Observe zero legality, ownership, or wildcard-cap errors.
- In five representative idea sets, find at least one idea worth opening in three or more sets.
- Turn a selected idea into a saved, legal, exportable deck in under three minutes.
- Confirm weak sets return one or two honest ideas instead of padding to three.

This product-quality gate has **not** been declared passed. Materialized feature storage, server-side resumable workbenches, broader profiles and themes, three-color Standard, sideboard guidance, Deck Doctor, collection-change digests, external metagame data, and AI remain deferred.
