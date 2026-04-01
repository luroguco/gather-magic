# Untapped Collection Capture

## Purpose
This is a research-only path for extracting Untapped's in-memory `mtga.collection` payload without shipping anything in the app yet.

Current local findings:
- Untapped's main process exposes the latest collection over `mtga.collection`.
- Untapped's renderer can call that channel through `window.electron.ipcRenderer.invoke("mtga.collection.invoke")`.
- Untapped also stores its settings in `~/Library/Application Support/untapped-companion/config.json`, and `showDevTools` can be toggled there.

This gives us a practical manual test loop:
1. enable Untapped DevTools
2. dump the live `mtga.collection` map from the renderer console
3. normalize the raw `grpId -> quantity` dump against Untapped's public MTGA catalog
4. compare the normalized result against the CSV baseline

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
- This is still a manual research path.
- It depends on Untapped's live renderer and its current IPC contract.
- It is suitable for validation and reverse-engineering, not for a shipped dependency.
- If `mtga.collection.invoke` returns `null`, MTGA is probably not in a scene where Untapped has populated the collection watcher yet.
