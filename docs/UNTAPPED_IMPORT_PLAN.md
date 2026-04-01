# Untapped-Compatible Import Plan

## Summary
The safest near-term import path is not direct MTGA process inspection. It is a local-first Untapped-compatible bridge:

1. user captures a raw Untapped `mtga.collection` dump locally
2. this app imports the raw `grpId -> quantity` map
3. backend normalizes it against Untapped's public MTGA catalog
4. collection ownership is saved into the same local collection model used by CSV import

This avoids:
- paid CSV export as the primary path
- direct MTGA debugger attachment
- account credential sharing

This does require:
- a local Untapped Companion install for the initial bridge path
- one manual export step until we can automate capture safely

## Why This Is The Right Next Move
- it already validated well against a real collection baseline
- it is safer than the LLDB collector path
- it keeps everything local
- it gives new users a much better import story than "pay for CSV export"
- it lets us ship a practical bridge now while we keep researching a first-party collector

Current validation status:
- `1,534` unique owned names vs CSV `1,534`
- `2,511` title-level total vs CSV `2,510`
- `2,540` print-level total vs CSV `2,539`
- `0` missing names
- `0` extra names
- `1` remaining mismatch: `Orris, Last of the Web Lords`

That is good enough to productize as an import path.

## Product Positioning
This should be framed as:
- `Import From Untapped Companion`
- local bridge import
- no credentials needed
- no cloud sync required

It should not be framed as:
- an Untapped integration partnership
- a direct API integration
- a permanent dependency for the final ideal architecture

The bridge story is:
- safe now
- accurate now
- better than CSV friction
- replaceable later if we build a first-party collector

## MVP Scope
The first shipped version should support:
- importing a raw Untapped collection JSON file
- guided instructions for generating that file locally
- previewing the import before save
- normalizing and storing playable title-level ownership
- preserving print-level ownership detail in raw import artifacts
- reporting unmatched `grpId`s and suspicious deltas

The MVP should not try to:
- scrape Untapped automatically
- control Untapped from inside the app
- require live MTGA runtime access
- auto-refresh in the background

## Proposed User Flow
### Path A: Guided File Import
1. user opens `Import`
2. user chooses `Untapped Companion`
3. app shows step-by-step instructions:
   - open Untapped Companion
   - open DevTools if needed
   - run the provided console snippet
   - save `untapped-mtga-collection.json`
4. user uploads that JSON
5. app previews:
   - total raw entries
   - unique owned titles
   - total playable copies
   - unmatched ids
   - warnings
6. user confirms import
7. app replaces current collection snapshot

### Path B: Power User Script
1. user runs a helper command from the repo or packaged helper
2. helper prints instructions and writes the raw dump
3. user imports the produced JSON file

Path A should come first because it is transparent and lower-risk.

## Data Contract
### Raw Input
Expected input:

```json
{
  "67021": 4,
  "69231": 2
}
```

Where:
- key = MTGA `grpId`
- value = owned quantity for that exact print/variant

### Normalized Output
Normalization should produce:
- `rawEntryCount`
- `rawTotalQuantity`
- `matchedVariantCount`
- `unmatchedGrpIds`
- `titles`
  - `cardName`
  - `titleCount`
  - `printCount`
  - `variants`

The current normalizer already does most of this.

### Saved Import Metadata
We should store:
- import source: `untapped-json`
- imported at timestamp
- raw file hash
- normalization version
- unmatched ids
- raw snapshot JSON path or stored blob

That gives us debuggability when Untapped changes shape later.

## Backend Plan
### 1. Add Untapped Import Endpoint
Add:
- `POST /imports/untapped-json/preview`
- `POST /imports/untapped-json`

`preview` should:
- accept uploaded JSON
- validate shape
- run normalization
- return summary only

`import` should:
- rerun normalization
- replace the current collection snapshot atomically
- save import metadata
- return final summary

### 2. Reuse Existing Collection Storage
Keep:
- `collection_cards` as the current playable ownership snapshot

Add if needed:
- `collection_card_variants`
  - `card_id`
  - `print_id`
  - `grp_id`
  - `owned_count`
  - `import_id`

If schema scope needs to stay tighter for the first slice, store variant detail in raw import metadata first and add the table later.

### 3. Normalize Through Untapped Public Catalog
Use the already validated `untapped-public` normalization path.

Requirements:
- resolve all `grpId`s through public catalog assets
- filter free default basics consistently
- derive title-level counts with deck-building caps
- preserve exact-print counts separately

### 4. Add Import Diffing
On preview, compare against current saved collection:
- titles added
- titles removed
- counts changed
- large deltas

That helps users trust the new import.

## Frontend Plan
### Import Surface
Add a new import card above CSV:
- `Untapped Companion`
- subtitle: `Import a local collection dump without a paid CSV export`

### Guided Instructions
Show:
- what Untapped Companion is needed for
- that no credentials are shared with this app
- exact console snippet to run
- sample expected filename

Include:
- copy button for the snippet
- download example JSON shape
- troubleshooting notes

### Preview Screen
Show:
- raw entries
- raw total quantity
- owned titles
- playable copies
- unmatched ids count
- changed vs current collection
- warnings

### Import Confirmation
Make the confirmation explicit:
- `Replace current collection snapshot`

This should mirror the CSV replacement semantics already in the app.

## Packaging / UX Options
### Option 1: Docs + JSON Upload
Smallest build slice.

Pros:
- fastest to ship
- lowest technical risk

Cons:
- still a manual export flow

### Option 2: Built-In Capture Helper Instructions
App can generate and show the exact console script dynamically and explain where to paste it.

Pros:
- smoother UX
- still safe

Cons:
- still manual

### Option 3: Local Bridge Helper
Later, package a tiny helper that:
- toggles Untapped DevTools if needed
- prints capture instructions
- optionally watches a chosen download folder

Pros:
- nicer workflow

Cons:
- more moving parts

MVP should be Option 1 or 2.

## Risk Management
### Main Risks
- Untapped changes the IPC contract
- Untapped changes the dump shape
- users do not have Untapped installed
- legal/product optics of depending on another companion tool

### Mitigations
- keep CSV import available
- store raw import artifacts for debugging
- version the normalizer
- clearly label this as a bridge import
- keep the importer tolerant of extra unknown JSON keys

## Testing Plan
### Unit Tests
- validate raw JSON shape parsing
- normalize a small fixture `grpId -> quantity` map
- verify basic land filtering
- verify playable title-count derivation
- verify unmatched `grpId` reporting

### Integration Tests
- preview endpoint does not mutate collection state
- import endpoint replaces current collection atomically
- imported playable counts match expected totals
- current owned-only search reflects Untapped import immediately

### Acceptance Tests
- import the real `untapped-mtga-collection.json`
- compare result against `Kodo Collection.csv`
- verify `Ajani's Pridemate` is `4`, not `16`
- verify search and deck ownership displays update correctly

## Non-Goals For This Phase
- direct runtime hooking into Untapped
- direct MTGA memory inspection
- mobile support
- automatic collection refresh
- multi-account sync

## Recommended Build Order
1. Add backend preview/import endpoints for raw Untapped JSON.
2. Expose a new `Untapped Companion` card on the Import page.
3. Add guided instructions and upload flow.
4. Add preview summary + diff.
5. Save import metadata and raw artifact details.
6. Add tests against the real fixture we already captured.

## Recommended Next Slice
Build the smallest useful slice:

1. `POST /imports/untapped-json/preview`
2. `POST /imports/untapped-json`
3. Import-page card + file upload
4. preview summary
5. confirm + save

That gets the bridge path into the app without needing more runtime research first.
