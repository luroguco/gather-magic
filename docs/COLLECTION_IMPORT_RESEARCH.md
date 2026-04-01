# Collection Import Research

## Summary
The original assumption was that `Player.log` would be the best free path for importing an MTG Arena collection. After inspecting fresh Arena logs, Untapped companion logs, the Untapped local support directory, and the Untapped app bundle, that assumption does not hold up.

Current conclusion:
- `Player.log` is not a reliable source of full owned-card collection data for the sessions we captured.
- Untapped is not deriving collection ownership from `Player.log`.
- Untapped is reading live MTGA process state through a native watcher layer, then normalizing the collection into a `grpId -> quantity` map before upload.
- Untapped's public MTGA JSON catalog is sufficient to resolve `grpId`s into card metadata, so our remaining hard problem is capturing the raw `grpId -> quantity` map ourselves.
- Apple `lldb` can attach to MTGA on this machine and can call exported IL2CPP runtime functions like `il2cpp_domain_get()` and `il2cpp_domain_get_assemblies(...)` successfully.
- Apple `lldb` attachment is not safe enough to use as an ongoing collection strategy here; a live probe caused MTGA to crash with `EXC_BREAKPOINT (SIGTRAP)` and took Epic Launcher down with it.
- If we want a broadly usable, free import path, the likely long-term solution is a small local desktop collector/helper that emits the raw ownership map, not a pure log parser and not a paid CSV export.

## Inputs Inspected

### Arena Logs
- `Player-home-snapshot.log`
- `Player-prev-home-snapshot.log`
- `Player-old.log`

### CSV Baseline
- `Kodo Collection.csv`

### Untapped Logs
- `untapped/log.log`
- `untapped/log.old.log`

### Untapped Local Files
- `~/Library/Application Support/untapped-companion/`
- `/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar`
- `/Applications/Untapped.gg Companion.app/Contents/Resources/app.asar.unpacked/`

## Arena Log Findings

### What Was Present
The latest `StartHook` payloads in the fresh Arena logs included:
- currencies
- wildcards
- boosters
- deck summaries
- decks
- cosmetics / metadata

### What Was Missing
The logs did not expose a usable owned-card collection map.

Across the captured sessions, `InventoryInfo` contained economy data but not title-level card ownership. That means the current real logs do not support a dependable collection import path on their own.

### Impact
`Player.log` can still be useful for:
- diagnostics
- economy state
- deck/import context
- possible future supplemental signals

But it should not be treated as the primary collection source unless a new payload shape is discovered later.

## CSV Baseline Findings

The CSV remains useful as a validation oracle for any future collector.

Current baseline from `Kodo Collection.csv`:
- `1,534` unique owned card names
- `2,510` title-level owned copies using `max(Count)` per name
- `2,539` print-level owned copies using `PrintCount`

This is the benchmark a future collector should match or explain.

## Untapped Log Findings

The Untapped logs strongly indicate that collection sync is not log-based.

Observed behaviors:
- watcher startup for `mtgaInventoryWatcher`
- `Mtga.OnScryCollectionChanged`
- `Mtga.OnScryInventoryChanged`
- `CollectionDataSync.uploadCollection`
- uploads to `/api/v1/account/collections/<playerId>`

These logs show that Untapped reacts to a live `collectionChanged` event and uploads a normalized collection payload. The logs do not show the payload body, but they do show the event flow clearly enough to rule out `Player.log` as the main source.

## Untapped Support Directory Findings

The local Untapped support directory contains:
- config/preferences
- logs
- caches
- `mtga.proto`
- session/local storage

What it did not expose, at least with basic inspection:
- an obvious saved collection JSON
- an obvious local collection SQLite DB
- a plainly readable ownership cache

The only directly relevant persistent clue found was `latestPlayerDataSyncHash`, which suggests deduped uploads rather than a locally stored canonical collection snapshot.

## Untapped App Bundle Findings

This was the most useful part of the investigation.

### 1. Collection Payload Shape
The app bundle shows a `PlayerCollectionData` / `CollectionDataSync` flow that builds:
- `cards: toQuantifiedCards(collection)`
- `wildcards`
- `gold`
- `gems`
- `vaultProgress`
- optional `screenName`

The important part is `collection`: it is normalized before upload into card quantities. That is the shape we want for our own tool.

### 2. Collection Is Stored Internally As A Map
The `mtgaInventoryWatcher` path shows that Untapped emits:
- `inventoryChanged`
- `collectionChanged`

and the collection payload is `curr.cards.data`.

That means Untapped's internal source of truth is effectively a dictionary of card ownership, not a log transcript.

### 3. macOS Uses Native MTGA Process Inspection
The bundle exposes a private native addon:
- `untapped-scry`

That addon exports:
- `Scry`
- `MonoScry`
- `Il2CppScry`
- supporting metadata / object wrappers

The bundle also shows that MTGA collection watching goes through `mtgaInventoryWatcher`, and the native reader stack is initialized differently by platform/runtime.

On macOS, the meaningful signal is that Untapped supports `Il2CppScry` and `getMetadataContext`, which strongly suggests the current desktop path is memory inspection against the running MTGA process rather than plain-text log parsing.

### 4. A Second Parsing Path Exists
The bundle also contains references to:
- `UnityCrossThreadMessageParser.tryGetPlayerInventory_GetPlayerInventory(...)`
- `UnityCrossThreadMessageParser.tryGetPlayerInventory_GetPlayerCardsV3(...)`

That implies Untapped may also parse internal Unity message payloads and surface collection changes that way. Either way, it is still operating on live game/runtime data, not relying on `Player.log`.

## What This Means For Our Product

### The Old Assumption Was Wrong
The original "just parse `Player.log`" direction is too optimistic.

### The More Realistic Free Path
If we want this app to be broadly usable without paid third-party exports, the strongest direction is:
- a small local desktop collector/helper
- reads the running MTGA process on desktop
- emits a normalized local ownership snapshot
- the web app imports that snapshot

### Product Framing
That is still a good product story:
- free
- local-first
- no account sharing
- no paid subscription
- much more accurate than fuzzy tracker/export workflows

It is just not a pure browser/web-only import path.

## Runtime Probe Update

A local runtime probe now exists in the repo:
- `npm run probe:mtga`
- `npm run probe:mtga:native`

What it proved so far:
- the local MTGA process can be found reliably
- the local `untapped-scry.node` addon can be loaded from our script
- `Scry.connect(pid)` still fails when that addon is hosted inside plain `node`
- a first-party native `task_for_pid` control test now exists so we can tell whether our own helper is viable independently of Untapped's private host/addon setup

### Native Attach Control Result
The native attach probe was run directly against a live MTGA PID on macOS.

Observed result:
- `proc_pidpath(pid)` succeeded
- `task_for_pid(mach_task_self(), pid, &task)` failed with kern return `5`
- message: `(os/kern) failure`

Interpretation:
- arbitrary local native code can identify the MTGA process
- arbitrary local native code cannot automatically obtain a task port
- `lldb` succeeding does not imply our own unsigned helper can attach the same way

This makes the host/signing question central. A viable collector will likely need one of:
- a properly signed desktop helper with the right runtime characteristics
- a signed Electron helper path
- instrumentation of an existing signed host that already has working MTGA visibility

The likely implication is that the addon is not sufficient by itself. The host process matters too, which makes a signed Electron/native helper much more likely than a plain Node CLI as the eventual collector shape.

## LLDB Collector Spike

A first-party LLDB-based collector spike now exists in the repo:
- `node apps/api/dist/scripts/collectMtgaWithLldb.js --pid <pid> --out data/mtga-lldb-collector-report.json`

What it proved:
- `lldb` can attach to live MTGA successfully
- `lldb` can evaluate exported IL2CPP functions directly
- `il2cpp_domain_get()` returns a valid pointer
- `il2cpp_domain_get_assemblies(...)` reports `155` loaded assemblies in the current build
- assembly names can be read from the live process, including:
  - `Core.dll`
  - `SharedClientCore.dll`
  - `Assembly-CSharp.dll`

Why this matters:
- it gives us a first-party Apple-debugger-based runtime seam that does not depend on Untapped's host process
- it avoids the `task_for_pid` limitation we hit with arbitrary local binaries
- it gives us a path to metadata-guided collection extraction, even though raw ownership capture is not implemented yet

Current status:
- the collector wrapper and Python module are in place
- the wrapper is now disabled by default unless explicitly force-enabled because a real attach crashed MTGA on macOS
- broad metadata scans were too expensive when matching very common tokens like `card` and `player`
- defaults were narrowed to targeted assemblies and higher-signal patterns:
  - assemblies: `Assembly-CSharp.dll`, `SharedClientCore.dll`
  - patterns: `collection`, `inventory`, `deckbuilder`, `pantry`, `wrapper`
- an exact-class inspection mode now exists, which is the preferred next step over substring scans

### First Exact-Class Targets
Offline metadata mining against `global-metadata.dat` surfaced a stronger first-pass target set:
- `CardCollection`
- `CollectionInfo`
- `InventoryManager`
- `SetCollectionController`
- `DeckBuilderModel`
- `DeckBuilderContext`
- `WrapperDeckBuilder`

Those names all exist in the current MTGA metadata image. The next collector run should inspect these exact classes first and dump their field names before doing any broader substring scan.

Convenience command:
- `npm run collect:mtga:collection-core -- --pid <pid> --out data/mtga-lldb-collector-report.json`

Risk note:
- do not use the LLDB collector casually on this machine/session
- the last live attach left a crash report with:
  - `External Modification Warnings: Debugger attached to process`
  - `Termination Reason: Namespace SIGNAL, Code 5 Trace/BPT trap: 5`
  - parent process recorded as the exited LLDB helper path
- treat LLDB attachment as paused research, not as a productizable import path

## Untapped Renderer IPC Capture

The most practical research path discovered so far is not raw MTGA memory access from our own host. It is Untapped's own renderer IPC.

Findings:
- Untapped's main process registers `mtga.collection` through its internal `ipcHandle(...)` helper.
- The renderer bridge exposes raw `ipcRenderer.invoke/send/on` on `window.electron`.
- Untapped's renderer already uses `useIpc("mtga.collection")` in multiple MTGA views.
- Untapped also supports a `showDevTools` setting in `~/Library/Application Support/untapped-companion/config.json`.

This gives us a manual validation path:
1. enable Untapped DevTools
2. run `window.electron.ipcRenderer.invoke("mtga.collection.invoke")` from the renderer console
3. save the raw `grpId -> quantity` JSON
4. normalize it against our own DB
5. compare it against the CSV baseline

Repo-local helpers for this path now exist:
- `npm run untapped:devtools:on`
- `npm run untapped:devtools:off`
- `npm run normalize:untapped-dump -- --input <raw-json> --out data/untapped-collection-normalized.json`

See `docs/UNTAPPED_COLLECTION_CAPTURE.md`.

### March 31, 2026 Validation Result

The manual Untapped renderer capture succeeded.

Observed raw dump:
- `1,725` raw `grpId -> quantity` entries
- `2,682` total quantity across those entries

First normalization result against the current local DB:
- `1,037` matched `grpId`s
- `688` unmatched `grpId`s
- `886` unique matched cards
- `1,399` title-level owned total
- `1,551` print-level owned total

CSV baseline for the same account:
- `1,534` unique owned names
- `2,510` title-level owned total
- `2,539` print-level owned total

Important interpretation:
- the Untapped dump is real and useful
- the current mismatch is not primarily a dump-quality problem
- the current mismatch is a catalog-mapping problem in our app

Concrete evidence:
- many unmatched `grpId`s appear directly in the CSV `Id` column
- the corresponding cards already exist in our DB by `name` and `set_code`
- but their `card_prints.arena_id` is `NULL`

Examples:
- `Bebop, Warthog Warrior` exists in our DB as set `TMT`, but the CSV/Untapped id `100516` is not present in `card_prints.arena_id`
- `Biosynthic Burst` exists in our DB as set `EOE`, but id `96747` is missing from `card_prints.arena_id`
- `Kyoshi Village` exists in our DB as set `TLA`, but id `97552` is missing from `card_prints.arena_id`
- `Keep Out` exists in our DB as set `ECL`, but id `98336` is missing from `card_prints.arena_id`

This points directly at the current sync source:
- we populate `card_prints.arena_id` from Scryfall `default_cards.arena_id`
- that source is incomplete for a meaningful slice of current Arena printings

## MTGJSON Follow-Up

MTGJSON was tested as the next obvious supplement source.

Result:
- MTGJSON has the affected cards, set codes, collector numbers, and `scryfallId`s
- but many modern Arena printings still do not expose `identifiers.mtgArenaId`
- the missing ids we care about remained missing after a full re-sync

Representative examples:
- `Keep Out` in `ECL`
- `Biosynthic Burst` in `EOE`
- `Kyoshi Village` in `TLA`
- `Bebop, Warthog Warrior` in `TMT`

Conclusion:
- MTGJSON is useful context, but it does not solve Arena `grpId` coverage for current collection import.

## Untapped Public MTGA JSON Result

Untapped exposes a public MTGA catalog at:
- `https://mtgajson.untapped.gg/v1/latest/cards.json`
- `https://mtgajson.untapped.gg/v1/latest/loc_en.json`

This catalog resolves the previously missing ids cleanly, including:
- `96747` `Biosynthic Burst`
- `97552` `Kyoshi Village`
- `98336` `Keep Out`
- `100516` `Bebop, Warthog Warrior`

After switching normalization to the Untapped public catalog and deriving title-level ownership from summed variant quantities with deck-building limits:
- default basic lands (`Plains`, `Island`, `Swamp`, `Mountain`, `Forest`) were filtered out
- exact-print counts were preserved
- title-level counts were converted to deck-usable counts

Final comparison against the CSV baseline:
- `1,534` probe unique names vs `1,534` CSV unique names
- `2,511` probe title-level total vs `2,510` CSV title-level total
- `2,540` probe print-level total vs `2,539` CSV print-level total
- `0` missing names
- `0` extra names
- `1` remaining title-count mismatch

The only remaining mismatch was:
- `Orris, Last of the Web Lords`: CSV `1`, Untapped dump `2`

Interpretation:
- catalog mapping is now effectively solved
- the single remaining discrepancy appears to be real source disagreement or account drift, not a normalization failure
- the remaining product problem is collecting the raw `grpId -> quantity` map without depending on Untapped

Official MTGJSON documentation explicitly includes `identifiers.mtgArenaId` on set-card records.

That makes MTGJSON the strongest next candidate for supplementing or replacing the current Arena-id mapping layer:
- keep Scryfall for oracle text, imagery, and broad metadata if desired
- supplement print-level Arena ids from MTGJSON `AllIdentifiers` or `AllPrintings`
- fill missing `card_prints.arena_id` values by `set + collector number` or equivalent print identity

If that works, the Untapped renderer dump path becomes much more credible as a free import path:
- Untapped gives us the raw live ownership map
- MTGJSON gives us broader Arena-id coverage
- our app normalizes into canonical cards locally

## Recommended Path Forward

### Phase 0: Host Access Spike
Stop treating process attachment as assumed. First prove a viable host.

Current best candidates:
- a minimal signed Electron collector app
- a signed native helper app bundle
- instrumentation around an existing signed host for research only

The goal of this phase is simply:
- obtain stable MTGA runtime access from our own host
- without depending on Untapped's private addon for production

### Phase 1: Reader Spike
Once host access is solved, build a narrow reader spike that tries to produce:
- `grpId -> quantity`
- economy fields if available

for a live MTGA desktop session.

### Phase 2: Normalization
Translate the collector output into:
- title-level deck-usable counts
- optional print/style detail

and compare it against the CSV baseline.

### Phase 3: Local Helper
If the spike works, package it as a local helper:
- desktop-only at first
- manual `refresh collection` action
- outputs JSON for the main app to import

### Phase 4: Product Integration
Make collection onboarding look like:
1. install or run local collector
2. click `Refresh from MTGA`
3. import normalized snapshot into the app

## Risks
- native process-reading work is harder than log parsing
- macOS and Windows may need different implementations
- Arena updates could break offsets / metadata assumptions
- Untapped's private implementation is informative, but not reusable as a shipped dependency

## Legal / Distribution Note
Untapped's `untapped-scry` module is private and unlicensed for our use. The point of this research is not to reuse or redistribute their code. The point is to learn the shape of the problem:
- the collection source is live runtime data
- the normalized output we want is a card-quantity map

Any shipped solution should be our own implementation or another dependency we are allowed to distribute.

## Practical Recommendation
Treat the collection-import problem as:
- `desktop collector + normalized snapshot import`

not:
- `parse Player.log and hope`

`Player.log` can remain a fallback/debug input, but it should not be the primary onboarding story unless later research uncovers a genuinely complete owned-card payload there.
