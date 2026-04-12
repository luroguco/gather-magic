# MTGA Collector App Plan

## Goal

Build a local desktop collector that can capture the MTG Arena collection directly, without:
- requiring Untapped Premium
- requiring the Untapped DevTools script
- relying on `Player.log` as the primary source

The collector should emit a local raw ownership snapshot in the shape:
- `grpId -> quantity`

The existing app can then preview and import that snapshot using the normalization and import paths already in the repo.

## Current Evidence

What is already proven in this repo:

- `Player.log` is not a reliable primary collection source.
- Untapped is almost certainly reading live MTGA runtime state, not just logs.
- once a raw `grpId -> quantity` map exists, normalization is effectively solved
- the current Untapped-public catalog flow already gets collection parity close enough to trust
- an ad hoc signed native helper can obtain a task port to live MTGA on this machine
- an ad hoc signed copied Node host can call `Scry.connect(pid)` successfully
- our own local collector code can now read `WrapperController.Instance.InventoryManager._inventoryServiceWrapper.Cards`
- the live `Cards` dictionary yields the expected `grpId -> quantity` entries
- the captured collector snapshot now matches the CSV baseline exactly after normalization
  - `1,559` unique names
  - `2,586` title-level owned total
  - `2,615` print-level owned total
  - `0` missing names
  - `0` extra names
  - `0` mismatched title counts

What is not proven yet:

- that the current signed-host approach is stable enough to package as a polished end-user collector app
- that the current capture path survives MTGA updates without more adaptation work

### April 2026 Signed-Node Breakthrough

The repo now includes a working local collector snapshot path:

- `npm run collect:mtga:snapshot`

What this command does:

- copies the current local `node` binary into `apps/api/out/node-probe/mtga_probe_node`
- ad hoc signs that copied host with:
  - `com.apple.security.cs.debugger`
  - `com.apple.security.get-task-allow`
- re-executes the collector under that signed host
- connects to live MTGA through `untapped-scry`
- walks:
  - `WrapperController.Instance`
  - `InventoryManager`
  - `_inventoryServiceWrapper`
  - `Cards`
- extracts the live dictionary entries into:
  - `data/collector/latest-collector-snapshot.json`

Current observed result:

- raw dictionary entries scanned: `1,931`
- filtered owned `grpId` entries: `1,750`
- the only obvious junk slot observed in the current map was `0 -> 0`
- the emitted snapshot envelope is already accepted by the repo's collector import path
- normalization and comparison against the baseline now produce an exact match

Interpretation:

- the hard extraction problem is no longer blocked
- the remaining work is productization, not proof of access

### April 2026 Phase 0 Spike Result

The repo now includes a dedicated Electron collector-host spike under `apps/collector`.

Observed result from the current headless probe run:

- the Electron host launches successfully outside the sandbox
- the shared runtime probe runs and finds the live MTGA PID
- `Scry.connect(...)` still fails from this unsigned/dev host shape
- an unsigned packaged macOS `.app` bundle now builds successfully from the repo
- an ad hoc signed packaged macOS `.app` bundle can run the headless probe locally
- `Scry.connect(...)` still fails from that ad hoc signed packaged host shape
- this machine currently has no valid code-signing identities, so the signed packaged-host experiment is still blocked
- the repo now supports an ad hoc signed packaged-host experiment for local-only testing without an Apple certificate

Interpretation:

- moving from plain Node to an unsigned Electron host was not enough by itself
- ad hoc local signing was enough to validate the packaged-host probe path, but it was not enough to cross the MTGA runtime-access boundary
- the next meaningful experiment is still a packaged signed Electron build
- if that still fails, stop pushing Electron-first and move to a signed native helper bundle

## Constraints

### Technical

- plain `node` is not a viable collector host on macOS for current probes
- arbitrary native code can find the MTGA process, but `task_for_pid(...)` failed from the unsigned helper path
- LLDB can attach, but that path already caused MTGA/Epic crashes and is not a product path
- Untapped's renderer IPC path is useful for validation, but should not be the shipped dependency

### Product

- the default user path must be simpler than "open DevTools and paste a script"
- the collector should be local-first and privacy-preserving
- the main app should remain responsible for preview, normalization, and import summary

### Legal / Practical Guardrails

- do not redistribute or depend on Untapped's private binaries in product code
- do not ship an LLDB-based collector
- treat research probes as disposable until host viability is proven

## Recommended Product Shape

Build a small macOS-first collector app with this split:

1. Collector host
   A signed desktop app whose only job is to talk to the running MTGA client and emit a raw snapshot.

2. Reader layer
   A native/runtime access layer that obtains the live collection signal.

3. Snapshot output
   A versioned JSON file containing:
   - `snapshotVersion`
   - `capturedAt`
   - `mtgaPid`
   - `buildInfo` when available
   - `collection: Record<string, number>`
   - optional diagnostics

4. Main app import
   The existing app previews and imports the collector snapshot using the current normalization flow.

This keeps the hard platform-specific work isolated from the main web app.

## Recommended First Implementation

### macOS-first signed Electron collector

This is the best first bet because:

- the current repo already has an Electron-hosted probe path
- Untapped appears to use a desktop host model closer to Electron/native than plain Node
- it gives us a UI surface later if we want a simple `Refresh From MTGA` button

If Electron hosting still cannot cross the runtime-access barrier, then the fallback is:
- a signed native helper app bundle

## Phase Plan

## Phase 0: Host Viability Spike

### Objective

Prove that our own signed desktop host can stably access MTGA runtime state on macOS.

### Deliverables

- a minimal collector app shell
- signed local build instructions
- attach viability report JSON
- explicit decision: `Electron host viable` or `Electron host not viable`

### Concrete work

1. Create a minimal collector app project.
2. Re-run the existing MTGA process lookup from inside that host.
3. Re-run attach/runtime viability probes from that host.
4. Record whether access differs between:
   - plain Node
   - dev Electron
   - packaged signed Electron
5. Preserve reports under a dedicated `data/` output path for comparison.

### Success criteria

- the host can reliably find the live MTGA PID
- runtime attach succeeds without LLDB
- access is stable across repeated runs
- MTGA does not crash during the smoke test

### Failure criteria

- packaged signed Electron still cannot obtain runtime access
- success depends on brittle manual debugger steps
- MTGA becomes unstable during smoke testing

### Decision gate

If packaged signed Electron fails, stop trying to force the web/plugin framing and switch to:
- signed native helper app bundle research

## Phase 1: Runtime Discovery

### Objective

Identify the actual runtime object or message path that yields the collection map.

### First candidate surfaces

- `CardCollection`
- `CollectionInfo`
- `InventoryManager`
- `SetCollectionController`
- `DeckBuilderModel`
- `DeckBuilderContext`
- `WrapperDeckBuilder`

### Secondary candidate surface

- Unity inventory/player-card message parsing if direct object reads are unstable

### Deliverables

- one written mapping of which runtime surface works
- field and container shape notes
- one sample raw collection dump from our own host

### Success criteria

- we can explain where the collection lives
- we can extract a raw `grpId -> quantity` map from our own host
- the shape is stable enough to try against multiple sessions

## Phase 2: Extraction Prototype

### Objective

Turn the working runtime seam into a manual `Refresh Collection` prototype.

### Output schema v1

```json
{
  "snapshotVersion": 1,
  "capturedAt": "2026-04-02T00:00:00.000Z",
  "platform": "darwin",
  "collectorVersion": "0.1.0",
  "mtgaPid": 12345,
  "collection": {
    "1001": 2,
    "1002": 1
  },
  "diagnostics": {
    "source": "runtime-direct",
    "warnings": []
  }
}
```

### Deliverables

- manual refresh button in the collector app
- snapshot saved to disk
- importer preview working against that snapshot

### Success criteria

- normalized import is within the existing known tolerance against the CSV baseline
- no obvious overcounting across print variants
- incomplete snapshots are detectable and rejected loudly

## Phase 3: Main App Integration

### Objective

Make the collector the default import path in the main app.

### UI shape

- `Refresh From MTGA` as the primary import action
- `Choose collector snapshot` as a fallback manual upload
- CSV import moved under secondary options

### API shape

- `POST /imports/collector-snapshot/preview`
- `POST /imports/collector-snapshot`

### Import summary

- owned titles
- playable owned copies
- raw print copies
- unresolved ids
- warnings if snapshot looks partial or stale

## Phase 4: Convenience

Only after manual refresh works:

- auto-detect running MTGA
- one-click refresh from the main app
- background watch mode
- collection diffs since last snapshot

## Experiment Matrix

### Experiment A: Existing probe inside packaged Electron

Purpose:
- determine whether host shape is the actual blocker

Pass:
- runtime connection succeeds in packaged Electron but not plain Node

Fail:
- both paths fail identically

### Experiment B: Signed native helper app bundle

Purpose:
- determine whether we need a smaller native host than Electron

Pass:
- helper can obtain stable runtime access

Fail:
- same `task_for_pid` wall remains

### Experiment C: Message-parser route

Purpose:
- determine whether direct object extraction is unnecessary

Pass:
- runtime message parsing yields the collection map more safely than raw object walking

Fail:
- messages are unavailable, incomplete, or too version-fragile

## Recommended Immediate Branch Tasks

If starting a new branch for implementation, do these first:

1. scaffold a minimal macOS collector app project
2. port the existing process lookup and probe reporting into that app
3. add a single `Run Attach Smoke Test` action
4. save the report JSON locally
5. test three environments:
   - plain Node
   - dev Electron
   - packaged signed Electron
6. write down the exact result in this doc or a follow-up findings doc
7. only then start runtime object extraction work

## What Not To Do Next

- do not spend more time on `Player.log` as the main import source
- do not productize the Untapped DevTools script
- do not build cross-platform packaging before macOS host viability is proven
- do not rely on LLDB as the intended user workflow
- do not tie the collector directly into the main app request path before snapshot import is stable

## Definition Of Done For MVP

The MVP is done when a desktop user can:

1. launch the collector
2. click `Refresh Collection`
3. import the snapshot into the app
4. see collection totals that match reality closely enough to trust for deckbuilding

without:
- pasting a DevTools script
- paying for a third-party export
- running a debugger manually
