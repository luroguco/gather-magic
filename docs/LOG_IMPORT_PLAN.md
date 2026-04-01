# MTG Arena Log Import Plan

## March 2026 Update
This document started from a `Player.log`-first assumption. Local research no longer supports that as the primary strategy.

Current status:
- captured `Player.log` sessions did not contain a usable owned-card collection map
- Untapped companion behavior strongly indicates that collection ownership comes from live MTGA runtime/process inspection, not `Player.log`
- Untapped's public MTGA catalog resolves `grpId`s reliably once we have the raw ownership map
- the recommended primary direction is now a desktop collector/helper that emits a raw `grpId -> quantity` snapshot and lets this app normalize it locally

See `docs/COLLECTION_IMPORT_RESEARCH.md` for the evidence and the updated recommendation.

## Summary
The original goal here was to make the app broadly usable without requiring paid third-party exports. That goal is still correct, but the likely implementation path has changed.

Wizards does not appear to provide an official collection CSV export or public collection API for MTG Arena. A pure `Player.log` importer is now better treated as a fallback/debug path rather than the main solution. The more credible free path is a local desktop collector that reads MTGA state directly, emits a raw `grpId -> quantity` snapshot, and then lets this app normalize that snapshot with the public Untapped MTGA catalog.

This plan assumes:
- desktop-first support comes first
- `Player.log` / `Player-prev.log` may still be useful, but are not assumed to be sufficient
- CSV stays as a fallback import path
- we prove collection extraction against real user data before integrating anything into the app

## Why This Matters
- removes the biggest adoption barrier
- avoids requiring Untapped Premium or any tracker account
- keeps import local and privacy-preserving
- gives us a free, repeatable import story for most desktop Arena users

## What We Know
- Wizards documents `Detailed Logs` and notes players may need them for community-built tools that inspect log data.
- Wizards documents desktop log locations and current log names:
  - Windows plain text log: `C:\Users\<user>\AppData\LocalLow\Wizards Of The Coast\MTGA\Player.log`
  - Windows previous session log: `player-prev.log`
  - Mac logs: `~/Library/Application Support/com.wizards.mtga/Logs/Logs/`
- Existing community tools already parse Arena logs for collection/inventory:
  - `kelesi/mtga-utils`
  - MTGA Tool
  - MTGA Pro Tracker

## Product Goal
Give a new user a free path that looks like this:

1. Run a local MTGA collection helper.
2. Refresh collection from the running Arena client.
3. Save a raw `grpId -> quantity` snapshot.
4. Preview and save normalized collection ownership in this app.

That should be the default onboarding path. CSV import remains available, and `Player.log` stays useful as a diagnostic or fallback signal, but not the main collection source.

## Phase 0: Parsing Spike
This should happen before any app integration work.

### Objective
Prove we can extract a reliable ownership snapshot from a real user MTGA session.

### Deliverables
- one or more real sample logs and runtime captures
- a small local collector spike
- a documented list of the exact runtime signals we depend on
- a normalized output shape for collection ownership
- a written decision on whether the runtime collector path is robust enough for MVP

Current local utility:
- `npm run compare:collection`
  - reads the repo-root CSV baseline if present
  - inspects the latest `StartHook` payload from `Player.log` / `Player-prev.log`
  - is ready to compare a future normalized ownership JSON via `--ownership-json <path>`
- `npm run probe:mtga`
  - macOS-first runtime probe for the live MTGA client
  - uses the locally installed `untapped-scry.node` only as a research dependency
  - emits a diagnostic report about process attach viability and metadata/image targets
  - current finding: process discovery works, but `Scry.connect(pid)` fails from plain `node`, so the collector likely needs a signed Electron/native host
- `npm run probe:mtga:electron`
  - Electron-hosted variant of the same probe
  - closer to Untapped's real `MainScry` / hidden-window process model
  - used to test whether renderer/electron hosting changes native attach behavior
- `npm run probe:mtga:native`
  - tiny first-party macOS attach smoke test
  - compiles a local helper that checks `proc_pidpath(pid)` and `task_for_pid(...)`
  - current finding: process path lookup works, but `task_for_pid` fails with `(os/kern) failure` from arbitrary local native code
- `node apps/api/dist/scripts/normalizeUntappedCollectionDump.js --input untapped-mtga-collection.json --catalog-source untapped-public --out data/untapped-collection-public-normalized.json`
  - normalizes a raw `grpId -> quantity` dump using Untapped's public MTGA catalog
  - current finding: catalog mapping is effectively solved once the raw ownership map is available
- `node apps/api/dist/scripts/collectMtgaWithLldb.js --pid <arena-pid> --out data/mtga-lldb-collector-report.json`
  - attaches through Apple `lldb` and walks exported IL2CPP metadata in the live MTGA process
  - current finding: LLDB can read assembly metadata successfully, so an Apple-debugger-based collector path is viable for further research
- `npm run collect:mtga:collection-core -- --pid <arena-pid> --out data/mtga-lldb-collector-report.json`
  - exact-class LLDB probe for the strongest current ownership candidates:
    - `CardCollection`
    - `CollectionInfo`
    - `InventoryManager`
    - `SetCollectionController`
    - `DeckBuilderModel`
    - `DeckBuilderContext`
    - `WrapperDeckBuilder`
  - current purpose: dump concrete field names from those classes before attempting broader runtime extraction
  - current status: paused for safety after a live attach crashed MTGA on macOS

### What To Test
- desktop MTGA session while the client is running
- a session where the user:
  - launches Arena
  - opens Deck Builder / collection browser
  - optionally changes preferred print/style on a card with multiple versions
- collector output should answer:
  - owned title-level count
  - owned print-level count, if available
  - whether style-only variants are distinguishable
  - whether wildcards/inventory are also available

### Acceptance Criteria
- we can extract a full owned collection snapshot from a real MTGA session
- we can explain exactly how we map title, print, and style ownership
- we can reproduce `Ajani's Pridemate`-style cases without fake overcounting
- we can explain what host/signing model is required for runtime access on macOS
- we can show that the normalized result matches an external baseline closely enough to trust
- we can identify the actual runtime classes that hold collection/inventory state

## Phase 1: Standalone Collector Spike
Build a local collector before changing the main app UI.

### Scope
- connect to live MTGA desktop state
- extract collection and inventory payloads
- emit a raw `grpId -> quantity` collection snapshot
- normalize card ownership into our existing collection model
- preserve raw source snapshots for debugging

Current most promising capture route:
- Untapped-compatible raw collection capture without attaching our own debugger
- LLDB-driven IL2CPP metadata inspection remains research-only and is paused on this machine after a confirmed crash

Current first target classes from offline metadata:
- `CardCollection`
- `CollectionInfo`
- `InventoryManager`
- `SetCollectionController`
- `DeckBuilderModel`
- `DeckBuilderContext`
- `WrapperDeckBuilder`

### Recommended Shape
- standalone collector or spike script outside the main backend request path
- likely output format:
  - JSON snapshot with raw `grpId -> quantity` collection data
  - optional economy data if available
- possible implementation buckets:
  - native helper
  - desktop-side Node bridge
  - platform-specific collector binaries if necessary

### Output Model
We should normalize two levels of ownership:

- title-level ownership:
  - what the user can actually put into a deck
- print/style-level ownership:
  - which print or cosmetic variant the user specifically owns

This matters because current Arena ownership semantics are not just "one row per card image."

### Current Validation Target
The current manual Untapped renderer capture plus public Untapped catalog normalization already gets us to:
- `1,534` unique owned names vs CSV `1,534`
- `2,511` title-level total vs CSV `2,510`
- `2,540` print-level total vs CSV `2,539`
- `0` missing names
- `0` extra names
- `1` remaining mismatch: `Orris, Last of the Web Lords` (`2` in the Untapped dump vs `1` in the CSV)

That means normalization is effectively proven. The remaining work is collector capture, not catalog mapping.

### Data Model Extension
Likely additions:
- `collection_card_variants`
  - `card_id`
  - `print_id`
  - `style_id` or equivalent if observable
  - `owned_count`
  - raw source metadata
- keep `collection_cards.count` as deck-usable title-level ownership
- keep raw collector snapshot JSON in a debug/import table if needed

## Phase 2: API Integration
Add explicit snapshot-import API endpoints.

### Proposed Endpoints
- `POST /imports/collector-snapshot`
  - upload collector JSON
  - return:
    - import summary
    - collector version
    - detected session timestamp / build info
    - matched titles
    - matched print/style entries
    - warnings
- `POST /imports/collector-snapshot/preview`
  - parse without saving
  - useful for validating new collector revisions safely

Optional later:
- `POST /imports/player-log`
  - fallback/debug import path only
- `POST /imports/player-log/preview`
  - fallback/debug preview only

### Response Shape
- `titlesMatched`
- `ownedPlayableCopies`
- `ownedVariantCopies`
- `unresolvedEntries`
- `warnings`
- `rawSignalsFound`

## Phase 3: UI Integration
Make collector import the primary import path.

### Import Page Changes
- add `Refresh From MTGA` or `Import From MTGA Helper` as the first option
- add short instructions:
  - run the local collector/helper
  - open Arena if required
  - refresh collection
- add platform tabs:
  - Windows
  - Mac
- keep CSV upload and log upload as `Other Import Options`

### Preview UX
- show:
  - playable owned copies
  - owned titles
  - owned print/style variants
  - warnings if the snapshot looks incomplete
- if we can detect stale/incomplete runtime data:
  - tell the user to reopen Arena and refresh again

## Phase 4: Power-User Convenience
Only after the manual collector path works.

### Potential Additions
- direct desktop app integration
- auto-watch mode while Arena is running
- one-click `refresh collection from Arena`
- diff view since last import

These are useful, but not required for MVP.

## Extraction Strategy
Use a layered collector pipeline.

### Layer 1: Runtime Capture
- attach to the running MTGA desktop process
- identify the collection and inventory signals we depend on
- tolerate missing/stale state and fail loudly when the collector cannot verify the runtime shape

### Layer 2: Domain Mapping
- identify collection/inventory-related runtime objects only
- extract:
  - card identifiers
  - owned counts
  - print/style identifiers where present

### Layer 3: Normalization
- map Arena ids using the public Untapped MTGA catalog and reconcile into our local model
- produce:
  - playable title counts
  - print/style ownership detail
- do not sum repeated title totals across variant rows

### Layer 4: Import Summary
- preserve diagnostics:
  - unknown payloads
  - unmatched ids
  - suspicious duplicates

## Key Risks
- runtime structures can change without notice
- mobile support is much worse than desktop
- platform-specific implementation work is likely required
- print/style ownership may be partially observable depending on the payload
- a desktop helper adds distribution complexity

## Guardrails
- collector must be versioned
- importer must fail loudly on unknown critical shapes
- preserve raw source snapshots for debugging
- preview before save should exist
- never overwrite collection silently if the snapshot looks incomplete

## Recommended User Flow For Manual Testing
Before we build this into the app, test collection extraction from a real MTGA session.

### Ask The User To Do This
1. Launch Arena.
2. Open `Collection`.
3. Open a card with multiple printings/styles if possible.
4. Leave Arena running.
5. Run the collector spike.
6. Save the normalized snapshot.

### What We Will Do In The Spike
- extract collection and inventory data from the live session
- normalize the runtime snapshot into stable JSON
- compare extracted counts against:
  - what Arena shows in-client
  - what the user expects
  - current CSV-derived counts

## Success Criteria For Shipping
- a new desktop user can import collection ownership without paying for a third-party export
- title-level ownership is consistent for deckbuilding
- variant/style ownership does not inflate playable counts
- import failure states are understandable and recoverable

## Sources
- Wizards log support:
  - https://mtgarena-support.wizards.com/hc/en-us/articles/360000726823-Creating-Log-Files-on-PC-Mac-Steam
- Wizards iOS log support:
  - https://mtgarena-support.wizards.com/hc/en-us/articles/360058644672-Creating-Log-Files-on-iOS
- Arena reprints / title-print-style ownership model:
  - https://magic.wizards.com/en/news/mtg-arena/dev-diary-improving-reprints
- Open-source collection exporter:
  - https://github.com/kelesi/mtga-utils
- Existing tracker examples:
  - https://mtgatool.com/docs/logs
  - https://github.com/Razviar/mtgap
