# Untapped Collection Capture

## Purpose

For this personal workspace, the default collection workflow reads Untapped Companion's in-memory `mtga.collection` payload automatically. It uses the free Companion app already running locally; it does not require Untapped Premium, a paid export, or Arena credentials.

Current local findings:
- Untapped's main process exposes the latest collection over `mtga.collection`.
- Untapped's renderer can call that channel through `window.electron.ipcRenderer.invoke("mtga.collection.invoke")`.
- Untapped also stores its settings in `~/Library/Application Support/untapped-companion/config.json`, and `showDevTools` can be toggled there.

The app now:

1. detects the installed/running Companion app
2. performs an explicit one-time restart with an ephemeral loopback-only DevTools port when required
3. invokes `mtga.collection.invoke` through Companion's existing renderer bridge
4. validates the bounded `grpId -> quantity` map and writes it atomically with mode `0600`
5. normalizes the map against Untapped's public MTGA catalog
6. previews the exact change set before any collection replacement
7. binds confirmation to the capture's SHA-256 so a newer capture cannot be imported accidentally

Use `Collection` → `Sync collection` in the web app. If Companion has not received a collection since it started, reconnect Arena or open its Collection/Decks view and retry.

## Local Bridge API

- `GET /api/imports/untapped-helper/status` reports installation, process, restart, and capture readiness.
- `POST /api/imports/untapped-helper/restart` gracefully restarts Companion with local automation enabled.
- `POST /api/imports/untapped-helper/capture-preview` captures and normalizes without changing the saved collection.
- `POST /api/imports/untapped-helper/import-latest` requires the previewed capture ID plus explicit confirmation.

## Manual Fallback

The DevTools procedure below remains available if Companion changes in a way that breaks the automatic bridge.

## Step 1: Enable Untapped DevTools
Run:

```bash
npm run untapped:devtools:on
```

That updates Untapped's `config.json` and prints the exact console snippet to use next.

To turn it back off later:

```bash
npm run untapped:devtools:off
```

## Step 2: Capture The Live Collection Map
1. Restart `Untapped.gg Companion`.
2. Leave `MTGA` open in Deck Builder with the owned-card view visible.
3. In the Untapped renderer DevTools console, run:

```js
(async () => {
  const collection = await window.electron.ipcRenderer.invoke("mtga.collection.invoke");
  const total = Object.values(collection ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  console.log("mtga.collection entries:", Object.keys(collection ?? {}).length);
  console.log("mtga.collection total quantity:", total);
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "untapped-mtga-collection.json";
  a.click();
  URL.revokeObjectURL(url);
})();
```

This should download a raw JSON file where the keys are Arena `grpId`s and the values are owned quantities.

## Step 3: Normalize The Dump
Run:

```bash
node apps/api/dist/scripts/normalizeUntappedCollectionDump.js --input <path-to-untapped-mtga-collection.json> --catalog-source untapped-public --out data/untapped-collection-public-normalized.json
```

What the normalizer does:
- reads the raw `grpId -> quantity` map
- resolves each `grpId` through Untapped's public `cards.json` + `loc_en.json`
- groups by title
- emits:
  - `titleCount`: deck-usable title-level count derived from exact-print copies
  - `printCount`: sum across matched variants
  - `variants`: matched `grpId` / print rows

Additional normalization behavior:
- filters out the five default basic land titles (`Plains`, `Island`, `Swamp`, `Mountain`, `Forest`)
- keeps snow basics and other collectible basics
- preserves exact-print quantities even when title-level playable count is capped

## Step 4: Compare Against The CSV Baseline
Run:

```bash
node apps/api/dist/scripts/compareCollectionSources.js --ownership-json data/untapped-collection-public-normalized.json
```

That will compare:
- CSV unique owned names
- CSV title-level totals
- normalized Untapped totals
- missing names
- mismatched title counts

## What Success Looks Like
The current validated result is:
- `1,534` unique owned names
- `2,511` title-level owned total
- `2,540` print-level owned total
- `0` missing names
- `0` extra names
- `1` remaining mismatch (`Orris, Last of the Web Lords`, CSV `1` vs dump `2`)

and, critically, we want known edge cases like `Ajani's Pridemate` to resolve to `4`, not `16`.

## Known Limits

- It depends on Untapped's live renderer and its current IPC contract.
- It is suitable for this trusted personal workspace, not as a distributable first-party collector.
- If `mtga.collection.invoke` returns `null`, MTGA is probably not in a scene where Untapped has populated the collection watcher yet.
- Companion updates may change the renderer target or IPC contract; failures are surfaced without replacing the current collection.
