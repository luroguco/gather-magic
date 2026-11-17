import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "../lib/database.js";
import { createDatabase } from "../lib/database.js";
import { buildApp } from "../app.js";
import { importCollectionCsv } from "../services/collectionImport.js";
import { syncCardsFromBulkData } from "../services/cardData.js";
import {
  arenaDeckPlayerLog,
  collectorSnapshotJson,
  duplicateVariantCollectionCsv,
  fixtureCards,
  untappedCollectionJson,
  validCollectionCsv
} from "./fixtures.js";

const buildMultipartFilePayload = (filename: string, content: string, contentType: string) => {
  const boundary = "----mtga-test-boundary";
  const body = Buffer.from(
    [
      `--${boundary}\r\n`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n`,
      `Content-Type: ${contentType}\r\n\r\n`,
      content,
      `\r\n--${boundary}--\r\n`
    ].join(""),
    "utf8"
  );

  return {
    payload: body,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      "content-length": String(body.byteLength)
    }
  };
};

describe("MTGA collection API", () => {
  let db: DbHandle;
  let app: ReturnType<typeof buildApp>;
  let helperRoot: string;
  let untappedConfigPath: string;
  let untappedDownloadsPath: string;
  let untappedCapturePath: string;
  let collectorSnapshotPath: string;
  let collectorAddonPath: string;
  let arenaPlayerLogPath: string;
  let cardCatalogSyncCalls: number;

  beforeEach(() => {
    db = createDatabase(":memory:");
    syncCardsFromBulkData(db, [...fixtureCards]);
    cardCatalogSyncCalls = 0;
    helperRoot = mkdtempSync(resolve(tmpdir(), "mtga-untapped-helper-"));
    untappedConfigPath = resolve(helperRoot, "config.json");
    untappedDownloadsPath = resolve(helperRoot, "Downloads");
    untappedCapturePath = resolve(
      helperRoot,
      "captures/latest-companion-collection.json"
    );
    collectorSnapshotPath = resolve(helperRoot, "collector/latest-collector-snapshot.json");
    collectorAddonPath = resolve(helperRoot, "untapped-scry.node");
    arenaPlayerLogPath = resolve(helperRoot, "Player.log");
    mkdirSync(untappedDownloadsPath, { recursive: true });
    writeFileSync(untappedConfigPath, JSON.stringify({ showDevTools: false }, null, 2));
    writeFileSync(collectorAddonPath, "test-addon");
    writeFileSync(arenaPlayerLogPath, arenaDeckPlayerLog);
    app = buildApp(db, {
      untappedCatalogSource: "database",
      collectorCatalogSource: "database",
      arenaDeckCatalogSource: "database",
      arenaPlayerLogPath,
      directCaptureEnabled: true,
      untappedConfigPath,
      untappedDownloadsPath,
      untappedCapturePath,
      cardCatalogSync: async () => {
        cardCatalogSyncCalls += 1;
        return {
          cardCount: 2,
          printCount: 2,
          syncMetadata: {
            source: "scryfall-default-cards",
            sourceUpdatedAt: "2026-10-02T21:05:53.875Z",
            downloadUri: "https://example.test/default-cards.json",
            syncedAt: "2026-10-02T23:25:21.107Z",
            cardCount: 2,
            printCount: 2
          },
          supplementedArenaIdCount: 0,
          supplementedArenaIdByScryfallIdCount: 0,
          supplementedArenaIdBySetCollectorCount: 0,
          skippedConflictingArenaIdCount: 0,
          mtgJsonSetCount: 1
        };
      },
      untappedBridgeOptions: {
        statusRunner: async () => ({
          companionInstalled: true,
          companionRunning: true,
          companionPid: 4401,
          automationState: "ready",
          readyToCapture: true,
          restartRequired: false,
          message: "Arena is ready to sync through Companion.",
          devToolsPort: 49152
        }),
        captureRunner: async () => {
          expect(cardCatalogSyncCalls).toBe(1);
          return JSON.parse(untappedCollectionJson) as Record<string, number>;
        },
        restartRunner: async () => undefined
      },
      collectorHelperOptions: {
        snapshotPath: collectorSnapshotPath,
        scryAddonPath: collectorAddonPath,
        codesignAvailable: true,
        mtgaPid: 11955,
        captureRunner: (snapshotPath) => {
          mkdirSync(dirname(snapshotPath), { recursive: true });
          writeFileSync(
            snapshotPath,
            JSON.stringify({
              ...(JSON.parse(collectorSnapshotJson) as Record<string, unknown>),
              capturedAt: new Date().toISOString()
            })
          );
        }
      }
    });
  });

  afterEach(async () => {
    await app.close();
    db.close();
    rmSync(helperRoot, { recursive: true, force: true });
  });

  it("indexes derived mechanic tags and supports mechanic search", async () => {
    const mechanicsResponse = await app.inject({
      method: "GET",
      url: "/api/mechanics"
    });
    expect(mechanicsResponse.statusCode).toBe(200);
    const mechanicsPayload = mechanicsResponse.json();
    expect(mechanicsPayload.items.some((item: { slug: string }) => item.slug === "blink")).toBe(true);

    const searchResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?mechanics=blink"
    });
    expect(searchResponse.statusCode).toBe(200);
    const searchPayload = searchResponse.json();
    expect(searchPayload.total).toBe(1);
    expect(searchPayload.items[0].name).toBe("Angelic Blink");
  });

  it("searches the synced Arena catalog even before a personal collection is imported", async () => {
    const catalogResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?q=Angelic"
    });
    expect(catalogResponse.statusCode).toBe(200);
    const catalogPayload = catalogResponse.json();
    expect(catalogPayload.total).toBe(1);
    expect(catalogPayload.items[0].name).toBe("Angelic Blink");

    const ownedOnlyResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?q=Angelic&ownedOnly=true"
    });
    expect(ownedOnlyResponse.statusCode).toBe(200);
    expect(ownedOnlyResponse.json().total).toBe(0);
  });

  it("returns camel-cased card print contracts", async () => {
    const searchResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?q=Angelic"
    });
    const cardId = searchResponse.json().items[0].id as string;

    const detailResponse = await app.inject({
      method: "GET",
      url: `/api/cards/${cardId}`
    });

    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().prints[0]).toMatchObject({
      printId: expect.any(String),
      arenaId: expect.any(Number),
      setCode: expect.any(String)
    });
    expect(detailResponse.json().prints[0]).not.toHaveProperty("print_id");
  });

  it("rejects requests from untrusted browser origins", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/status",
      headers: {
        origin: "https://malicious.example"
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it("accepts loopback browser origins when Vite selects another development port", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/status",
      headers: {
        origin: "http://127.0.0.1:5174"
      }
    });

    expect(response.statusCode).toBe(200);
  });

  it("filters mechanics to owned cards when requested", async () => {
    importCollectionCsv(db, validCollectionCsv);

    const mechanicsResponse = await app.inject({
      method: "GET",
      url: "/api/mechanics?ownedOnly=true"
    });

    expect(mechanicsResponse.statusCode).toBe(200);
    const payload = mechanicsResponse.json();
    expect(payload.items.some((item: { slug: string }) => item.slug === "blink")).toBe(true);
    expect(payload.items.some((item: { slug: string }) => item.slug === "board-wipe")).toBe(false);
  });

  it("imports collection ownership and surfaces unresolved rows", async () => {
    const result = importCollectionCsv(db, validCollectionCsv);
    expect(result.cardsMatched).toBe(3);
    expect(result.ownedCopies).toBe(4);
    expect(result.unresolvedRows).toHaveLength(1);

    const ownedOnlyResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?ownedOnly=true"
    });
    const payload = ownedOnlyResponse.json();
    expect(payload.items).toHaveLength(3);
    expect(payload.items[0].ownedCount).toBeGreaterThan(0);
  });

  it("previews collection CSV changes without replacing the stored collection", async () => {
    const previewMultipart = buildMultipartFilePayload(
      "collection.csv",
      validCollectionCsv,
      "text/csv"
    );
    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/imports/collection-csv/preview",
      payload: previewMultipart.payload,
      headers: previewMultipart.headers
    });

    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toMatchObject({
      source: "collection-csv",
      rowsRead: 3,
      ownedTitles: 3,
      ownedCopies: 4,
      diff: {
        addedTitles: 3,
        removedTitles: 0,
        changedTitles: 0,
        unchangedTitles: 0
      }
    });

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/status"
    });
    expect(statusResponse.json().collection.ownedEntries).toBe(0);
  });

  it("requires explicit confirmation before a CSV replaces most of the collection", async () => {
    const largeCsv = [
      "Id,Name,Set,Color,Rarity,Count,PrintCount",
      ...Array.from(
        { length: 20 },
        (_, index) =>
          `${5000 + index},"Placeholder ${index}",TST,Blue,Common,1,1`
      )
    ].join("\n");
    importCollectionCsv(db, largeCsv);

    const blockedMultipart = buildMultipartFilePayload(
      "replacement.csv",
      validCollectionCsv,
      "text/csv"
    );
    const blockedResponse = await app.inject({
      method: "POST",
      url: "/api/imports/collection-csv",
      payload: blockedMultipart.payload,
      headers: blockedMultipart.headers
    });
    expect(blockedResponse.statusCode).toBe(409);

    const confirmedMultipart = buildMultipartFilePayload(
      "replacement.csv",
      validCollectionCsv,
      "text/csv"
    );
    const confirmedResponse = await app.inject({
      method: "POST",
      url: "/api/imports/collection-csv?confirmSuspiciousDiff=true",
      payload: confirmedMultipart.payload,
      headers: confirmedMultipart.headers
    });
    expect(confirmedResponse.statusCode).toBe(200);
    expect(confirmedResponse.json().ownedCopies).toBe(4);
  });

  it("does not double count repeated functional ownership across print variants", async () => {
    const result = importCollectionCsv(db, duplicateVariantCollectionCsv);
    expect(result.cardsMatched).toBe(1);
    expect(result.ownedCopies).toBe(4);

    const response = await app.inject({
      method: "GET",
      url: "/api/cards/search?ownedOnly=true&q=Ajani%27s%20Pridemate"
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.total).toBe(1);
    expect(payload.items[0].ownedCount).toBe(4);
    expect(payload.items[0].rawOwnedCount).toBe(4);
  });

  it("filters search results by playable owned count", async () => {
    importCollectionCsv(db, validCollectionCsv);

    const minResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?playableCountMin=2"
    });
    expect(minResponse.statusCode).toBe(200);
    expect(minResponse.json().items.map((item: { name: string }) => item.name)).toEqual(["Angelic Blink"]);

    const maxResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?ownedOnly=true&playableCountMax=1"
    });
    expect(maxResponse.statusCode).toBe(200);
    expect(maxResponse.json().items.map((item: { name: string }) => item.name).sort()).toEqual([
      "Grave Whisper",
      "Unknown Card"
    ]);
  });

  it("returns owned-collection stats with playable ownership totals and breakdowns", async () => {
    importCollectionCsv(db, validCollectionCsv);

    const response = await app.inject({
      method: "GET",
      url: "/api/stats/cards?ownedOnly=true"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.scope.ownedOnly).toBe(true);
    expect(payload.summary.matchingTitles).toBe(3);
    expect(payload.summary.playableOwnedCopies).toBe(4);
    expect(payload.summary.rawOwnedCopies).toBe(4);
    expect(payload.summary.setsRepresented).toBe(1);
    expect(payload.summary.mechanicsRepresented).toBeGreaterThan(0);
    expect(payload.breakdowns.colors.map((item: { key: string }) => item.key).sort()).toEqual([
      "mono-black",
      "mono-blue",
      "mono-white"
    ]);
    expect(payload.breakdowns.types.map((item: { key: string }) => item.key).sort()).toEqual([
      "creature",
      "other",
      "sorcery"
    ]);
    expect(payload.breakdowns.subtypes.map((item: { key: string }) => item.key)).toEqual(["angel"]);
    expect(payload.breakdowns.tribes.map((item: { key: string }) => item.key)).toEqual(["angel"]);
    expect(payload.breakdowns.typeTree).toEqual([
      {
        key: "creature",
        label: "Creature",
        kind: "type",
        titleCount: 1,
        playableOwnedCopies: 2,
        rawOwnedCopies: 2,
        children: [
          {
            key: "angel",
            label: "Angel",
            kind: "tribe",
            titleCount: 1,
            playableOwnedCopies: 2,
            rawOwnedCopies: 2
          }
        ]
      },
      {
        key: "sorcery",
        label: "Sorcery",
        kind: "type",
        titleCount: 1,
        playableOwnedCopies: 1,
        rawOwnedCopies: 1,
        children: []
      },
      {
        key: "other",
        label: "Other",
        kind: "type",
        titleCount: 1,
        playableOwnedCopies: 1,
        rawOwnedCopies: 1,
        children: []
      }
    ]);
  });

  it("reports print-level raw copies separately from playable copies", async () => {
    importCollectionCsv(db, validCollectionCsv);
    db.prepare(
      `
      UPDATE collection_cards
      SET print_count = 7
      WHERE card_id = (SELECT id FROM cards WHERE name = 'Angelic Blink')
    `
    ).run();

    const response = await app.inject({
      method: "GET",
      url: "/api/stats/cards?ownedOnly=true"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.summary.playableOwnedCopies).toBe(4);
    expect(payload.summary.rawOwnedCopies).toBe(9);
    expect(
      payload.breakdowns.colors.find((item: { key: string }) => item.key === "mono-white")
    ).toMatchObject({
      playableOwnedCopies: 2,
      rawOwnedCopies: 7
    });
  });

  it("returns full-catalog stats and respects filters", async () => {
    importCollectionCsv(db, validCollectionCsv);

    const response = await app.inject({
      method: "GET",
      url: "/api/stats/cards?format=standard&types=Creature"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.scope.ownedOnly).toBe(false);
    expect(payload.scope.filtersApplied.format).toBe("standard");
    expect(payload.scope.filtersApplied.types).toEqual(["Creature"]);
    expect(payload.summary.matchingTitles).toBe(2);
    expect(payload.breakdowns.types).toEqual([
      {
        key: "creature",
        label: "Creature",
        titleCount: 2,
        playableOwnedCopies: 2,
        rawOwnedCopies: 2
      }
    ]);
  });

  it("supports exact metric drilldowns in card search", async () => {
    importCollectionCsv(db, validCollectionCsv);

    const colorResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?ownedOnly=true&drilldownKind=color&drilldownKey=mono-white"
    });
    expect(colorResponse.statusCode).toBe(200);
    expect(colorResponse.json().items.map((item: { name: string }) => item.name)).toEqual(["Angelic Blink"]);

    const rarityResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?drilldownKind=rarity&drilldownKey=rare"
    });
    expect(rarityResponse.statusCode).toBe(200);
    expect(rarityResponse.json().items.map((item: { name: string }) => item.name).sort()).toEqual([
      "Angelic Blink",
      "Dawnfall",
      "Unknown Card"
    ]);

    const mechanicResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?ownedOnly=true&drilldownKind=mechanic&drilldownKey=flying"
    });
    expect(mechanicResponse.statusCode).toBe(200);
    expect(mechanicResponse.json().items.map((item: { name: string }) => item.name)).toEqual(["Angelic Blink"]);

    const subtypeResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?ownedOnly=true&drilldownKind=subtype&drilldownKey=angel"
    });
    expect(subtypeResponse.statusCode).toBe(200);
    expect(subtypeResponse.json().items.map((item: { name: string }) => item.name)).toEqual(["Angelic Blink"]);

    const tribeResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?ownedOnly=true&drilldownKind=tribe&drilldownKey=angel"
    });
    expect(tribeResponse.statusCode).toBe(200);
    expect(tribeResponse.json().items.map((item: { name: string }) => item.name)).toEqual(["Angelic Blink"]);
  });

  it("limits mechanic stats to the filtered subset without duplicate inflation", async () => {
    importCollectionCsv(db, validCollectionCsv);

    const response = await app.inject({
      method: "GET",
      url: "/api/stats/cards?ownedOnly=true&q=Angelic"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.summary.matchingTitles).toBe(1);
    expect(payload.breakdowns.mechanics.every((item: { titleCount: number }) => item.titleCount === 1)).toBe(true);
  });

  it("starts the untapped helper and reports local capture status", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/imports/untapped-helper/start"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.status.showDevTools).toBe(true);
    expect(payload.status.downloadsPath).toBe(untappedDownloadsPath);
    expect(payload.status.automationState).toBe("ready");
    expect(payload.snippet).toContain("mtga.collection.invoke");
  });

  it("captures and previews the live collection through Companion automation", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/imports/untapped-helper/capture-preview"
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.capture.source).toBe("automated");
    expect(payload.capture.id).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.capture.path).toBe(untappedCapturePath);
    expect(payload.rawEntryCount).toBe(3);
    expect(payload.ownedTitles).toBe(2);
    expect(payload.ownedCopies).toBe(3);
    expect(cardCatalogSyncCalls).toBe(1);
    expect(payload.catalogSync).toEqual({
      sourceUpdatedAt: "2026-10-02T21:05:53.875Z",
      syncedAt: "2026-10-02T23:25:21.107Z",
      cardCount: 2,
      printCount: 2
    });
  });

  it("previews and imports the latest untapped capture from the downloads folder", async () => {
    writeFileSync(resolve(untappedDownloadsPath, "untapped-mtga-collection.json"), untappedCollectionJson);

    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/imports/untapped-helper/preview-latest"
    });

    expect(previewResponse.statusCode).toBe(200);
    const previewPayload = previewResponse.json();
    expect(previewPayload.capture.filename).toBe("untapped-mtga-collection.json");
    expect(previewPayload.capture.id).toMatch(/^[a-f0-9]{64}$/);
    expect(previewPayload.ownedTitles).toBe(2);
    expect(previewPayload.ownedCopies).toBe(3);

    const importResponse = await app.inject({
      method: "POST",
      url: `/api/imports/untapped-helper/import-latest?captureId=${previewPayload.capture.id}`
    });

    expect(importResponse.statusCode).toBe(200);
    const importPayload = importResponse.json();
    expect(typeof importPayload.importedAt).toBe("string");
    expect(importPayload.capture.filename).toBe("untapped-mtga-collection.json");

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/status"
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json().collection.ownedEntries).toBe(2);
    expect(statusResponse.json().collection.ownedCopies).toBe(3);
  });

  it("rejects importing a Companion capture that changed after preview", async () => {
    writeFileSync(
      resolve(untappedDownloadsPath, "untapped-mtga-collection.json"),
      untappedCollectionJson
    );

    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/imports/untapped-helper/preview-latest"
    });
    const captureId = previewResponse.json().capture.id as string;
    writeFileSync(
      resolve(untappedDownloadsPath, "untapped-mtga-collection.json"),
      JSON.stringify({ 1001: 1 })
    );

    const importResponse = await app.inject({
      method: "POST",
      url: `/api/imports/untapped-helper/import-latest?captureId=${captureId}`
    });

    expect(importResponse.statusCode).toBe(409);
    expect(importResponse.json()).toMatchObject({
      code: "CAPTURE_CHANGED"
    });
  });

  it("previews untapped collection JSON with database-backed grpId resolution", async () => {
    const multipart = buildMultipartFilePayload(
      "untapped-mtga-collection.json",
      untappedCollectionJson,
      "application/json"
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/untapped-json/preview",
      payload: multipart.payload,
      headers: multipart.headers
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.catalogSource).toBe("database");
    expect(payload.matchedGrpIds).toBe(2);
    expect(payload.unmatchedGrpIds).toBe(1);
    expect(payload.ownedTitles).toBe(2);
    expect(payload.ownedCopies).toBe(3);
    expect(payload.rawOwnedCopies).toBe(3);
    expect(payload.unresolvedCards).toEqual([]);
    expect(payload.diff).toEqual({
      addedTitles: 2,
      removedTitles: 0,
      changedTitles: 0,
      unchangedTitles: 0
    });
  });

  it("imports untapped collection JSON and replaces the stored snapshot", async () => {
    const multipart = buildMultipartFilePayload(
      "untapped-mtga-collection.json",
      untappedCollectionJson,
      "application/json"
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/untapped-json",
      payload: multipart.payload,
      headers: multipart.headers
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(typeof payload.importedAt).toBe("string");
    expect(payload.ownedTitles).toBe(2);
    expect(payload.ownedCopies).toBe(3);

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/status"
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json().collection.ownedEntries).toBe(2);
    expect(statusResponse.json().collection.ownedCopies).toBe(3);

    const searchResponse = await app.inject({
      method: "GET",
      url: "/api/cards/search?ownedOnly=true"
    });
    expect(searchResponse.statusCode).toBe(200);
    const searchPayload = searchResponse.json();
    expect(searchPayload.total).toBe(2);
    expect(searchPayload.items.map((item: { name: string }) => item.name).sort()).toEqual([
      "Angelic Blink",
      "Grave Whisper"
    ]);
  });

  it("resolves Untapped front-face names to canonical double-faced cards", async () => {
    syncCardsFromBulkData(db, [
      ...fixtureCards,
      {
        id: "print-peter-parker",
        oracle_id: "oracle-peter-parker",
        arena_id: 4002,
        name: "Peter Parker // Amazing Spider-Man",
        oracle_text: "Transforms into Amazing Spider-Man.",
        mana_cost: "{1}{U}",
        cmc: 2,
        colors: ["U"],
        color_identity: ["U"],
        type_line:
          "Legendary Creature — Human Scientist Hero // Legendary Creature — Spider Human Hero",
        rarity: "rare",
        layout: "transform",
        keywords: [],
        legalities: {
          standard: "legal"
        },
        set: "SPM",
        collector_number: "10",
        released_at: "2026-01-01",
        games: ["arena"]
      }
    ]);
    db.prepare(`
      INSERT INTO cards (
        id, name, normalized_name, oracle_text, mana_value, colors_json,
        color_identity_json, type_line, rarity, layout, keywords_json, legalities_json
      ) VALUES (
        'placeholder:untapped:peter-parker', 'Peter Parker', 'peter parker', '', 0,
        '[]', '[]', '', '', 'normal', '[]', '{}'
      )
    `).run();
    db.prepare(`
      INSERT INTO card_prints (
        print_id, card_id, arena_id, set_code, collector_number, games_json
      ) VALUES (
        'placeholder-peter-print', 'placeholder:untapped:peter-parker', 4001,
        'ARENA', NULL, '["arena"]'
      )
    `).run();

    const multipart = buildMultipartFilePayload(
      "front-face.json",
      JSON.stringify({ 4001: 1 }),
      "application/json"
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/imports/untapped-json",
      payload: multipart.payload,
      headers: multipart.headers
    });
    expect(response.statusCode).toBe(200);

    const collectionRow = db
      .prepare("SELECT card_id, count FROM collection_cards")
      .get() as { card_id: string; count: number };
    expect(collectionRow).toEqual({
      card_id: "oracle-peter-parker",
      count: 1
    });
  });

  it("previews collector snapshot JSON with snapshot metadata", async () => {
    const multipart = buildMultipartFilePayload(
      "mtga-collector-snapshot.json",
      collectorSnapshotJson,
      "application/json"
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/collector-snapshot/preview",
      payload: multipart.payload,
      headers: multipart.headers
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.source).toBe("collector-snapshot");
    expect(payload.extractedPath).toBe("root.collection");
    expect(payload.snapshotMetadata).toEqual({
      snapshotVersion: 1,
      status: "complete",
      capturedAt: "2026-04-03T02:15:00.000Z",
      platform: "darwin",
      collectorVersion: "0.1.0",
      mtgaPid: 11955,
      entryCount: 3,
      totalQuantity: 7,
      diagnostics: {
        source: "runtime-direct",
        warnings: ["attach failed"]
      }
    });
    expect(payload.matchedGrpIds).toBe(2);
    expect(payload.unmatchedGrpIds).toBe(1);
    expect(payload.ownedTitles).toBe(2);
    expect(payload.ownedCopies).toBe(3);
  });

  it("imports collector snapshot JSON and replaces the stored snapshot", async () => {
    const multipart = buildMultipartFilePayload(
      "mtga-collector-snapshot.json",
      collectorSnapshotJson,
      "application/json"
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/collector-snapshot",
      payload: multipart.payload,
      headers: multipart.headers
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.source).toBe("collector-snapshot");
    expect(typeof payload.importedAt).toBe("string");
    expect(payload.snapshotMetadata.snapshotVersion).toBe(1);
    expect(payload.ownedTitles).toBe(2);
    expect(payload.ownedCopies).toBe(3);

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/status"
    });
    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json().collection.ownedEntries).toBe(2);
    expect(statusResponse.json().collection.ownedCopies).toBe(3);
  });

  it("rejects unsupported and internally inconsistent collector snapshots", async () => {
    for (const invalidSnapshot of [
      {
        ...JSON.parse(collectorSnapshotJson),
        snapshotVersion: 2
      },
      {
        ...JSON.parse(collectorSnapshotJson),
        totalQuantity: 999
      },
      {
        ...JSON.parse(collectorSnapshotJson),
        status: "partial"
      }
    ]) {
      const multipart = buildMultipartFilePayload(
        "invalid-collector-snapshot.json",
        JSON.stringify(invalidSnapshot),
        "application/json"
      );
      const response = await app.inject({
        method: "POST",
        url: "/api/imports/collector-snapshot/preview",
        payload: multipart.payload,
        headers: multipart.headers
      });
      expect(response.statusCode).toBe(400);
    }
  });

  it("records and restores collection import history", async () => {
    importCollectionCsv(db, validCollectionCsv);

    const multipart = buildMultipartFilePayload(
      "mtga-collector-snapshot.json",
      collectorSnapshotJson,
      "application/json"
    );
    const importResponse = await app.inject({
      method: "POST",
      url: "/api/imports/collector-snapshot",
      payload: multipart.payload,
      headers: multipart.headers
    });
    expect(importResponse.statusCode).toBe(200);

    const historyResponse = await app.inject({
      method: "GET",
      url: "/api/collection/imports"
    });
    expect(historyResponse.statusCode).toBe(200);
    const history = historyResponse.json().items as Array<{
      id: string;
      source: string;
    }>;
    const csvImport = history.find((item) => item.source === "collection-csv");
    expect(csvImport).toBeDefined();

    const restoreResponse = await app.inject({
      method: "POST",
      url: `/api/collection/imports/${csvImport?.id}/restore`
    });
    expect(restoreResponse.statusCode).toBe(200);

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/status"
    });
    expect(statusResponse.json().collection.ownedEntries).toBe(3);
    expect(statusResponse.json().collection.ownedCopies).toBe(4);
  });

  it("disables privileged capture routes unless explicitly enabled", async () => {
    const restrictedApp = buildApp(db, {
      untappedCatalogSource: "database",
      collectorCatalogSource: "database",
      directCaptureEnabled: false
    });
    try {
      const statusResponse = await restrictedApp.inject({
        method: "GET",
        url: "/api/imports/collector-helper/status"
      });
      expect(statusResponse.statusCode).toBe(200);
      expect(statusResponse.json()).toMatchObject({
        enabled: false,
        available: false
      });

      const captureResponse = await restrictedApp.inject({
        method: "POST",
        url: "/api/imports/collector-helper/capture-preview"
      });
      expect(captureResponse.statusCode).toBe(403);
    } finally {
      await restrictedApp.close();
    }
  });

  it("supports an optional per-launch API capability token", async () => {
    const tokenApp = buildApp(db, {
      untappedCatalogSource: "database",
      localApiToken: "test-capability"
    });
    try {
      const unauthorized = await tokenApp.inject({
        method: "GET",
        url: "/api/status"
      });
      expect(unauthorized.statusCode).toBe(401);

      const authorized = await tokenApp.inject({
        method: "GET",
        url: "/api/status",
        headers: {
          authorization: "Bearer test-capability"
        }
      });
      expect(authorized.statusCode).toBe(200);
    } finally {
      await tokenApp.close();
    }
  });

  it("captures, previews, and imports the latest collector snapshot through the local helper", async () => {
    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/imports/collector-helper/status"
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      available: true,
      readyToCapture: true,
      addonAvailable: true,
      mtgaRunning: true,
      latestCapture: null
    });

    const capturePreviewResponse = await app.inject({
      method: "POST",
      url: "/api/imports/collector-helper/capture-preview"
    });

    expect(capturePreviewResponse.statusCode).toBe(200);
    const capturePreviewPayload = capturePreviewResponse.json();
    expect(capturePreviewPayload.capture.filename).toBe("latest-collector-snapshot.json");
    expect(capturePreviewPayload.capture.id).toMatch(/^[a-f0-9]{64}$/);
    expect(capturePreviewPayload.snapshotMetadata.snapshotVersion).toBe(1);
    expect(capturePreviewPayload.ownedTitles).toBe(2);
    expect(capturePreviewPayload.ownedCopies).toBe(3);

    const previewLatestResponse = await app.inject({
      method: "POST",
      url: "/api/imports/collector-helper/preview-latest"
    });

    expect(previewLatestResponse.statusCode).toBe(200);
    expect(previewLatestResponse.json().capture.filename).toBe("latest-collector-snapshot.json");

    const importLatestResponse = await app.inject({
      method: "POST",
      url: `/api/imports/collector-helper/import-latest?captureId=${capturePreviewPayload.capture.id}`
    });

    expect(importLatestResponse.statusCode).toBe(200);
    const importLatestPayload = importLatestResponse.json();
    expect(typeof importLatestPayload.importedAt).toBe("string");
    expect(importLatestPayload.capture.filename).toBe("latest-collector-snapshot.json");
    expect(importLatestPayload.ownedTitles).toBe(2);
    expect(importLatestPayload.ownedCopies).toBe(3);
  });

  it("rejects importing a collector capture that changed after preview", async () => {
    const capturePreviewResponse = await app.inject({
      method: "POST",
      url: "/api/imports/collector-helper/capture-preview"
    });
    expect(capturePreviewResponse.statusCode).toBe(200);
    const captureId = capturePreviewResponse.json().capture.id as string;

    const changedSnapshot = {
      ...(JSON.parse(collectorSnapshotJson) as Record<string, unknown>),
      capturedAt: new Date().toISOString(),
      totalQuantity: 8,
      collection: {
        1001: 3,
        1002: 1,
        9999: 4
      }
    };
    writeFileSync(collectorSnapshotPath, JSON.stringify(changedSnapshot));

    const importResponse = await app.inject({
      method: "POST",
      url: `/api/imports/collector-helper/import-latest?captureId=${captureId}`
    });

    expect(importResponse.statusCode).toBe(409);
    expect(importResponse.json()).toMatchObject({
      code: "CAPTURE_CHANGED"
    });
    const statusResponse = await app.inject({ method: "GET", url: "/api/status" });
    expect(statusResponse.json().collection.ownedCopies).toBe(0);
  });

  it("returns an actionable direct-capture error when Arena is not running", async () => {
    const unavailableApp = buildApp(db, {
      untappedCatalogSource: "database",
      collectorCatalogSource: "database",
      directCaptureEnabled: true,
      collectorHelperOptions: {
        snapshotPath: collectorSnapshotPath,
        scryAddonPath: collectorAddonPath,
        codesignAvailable: true,
        mtgaPid: null,
        captureRunner: () => undefined
      }
    });
    try {
      const statusResponse = await unavailableApp.inject({
        method: "GET",
        url: "/api/imports/collector-helper/status"
      });
      expect(statusResponse.json()).toMatchObject({
        available: true,
        readyToCapture: false,
        mtgaRunning: false
      });

      const captureResponse = await unavailableApp.inject({
        method: "POST",
        url: "/api/imports/collector-helper/capture-preview"
      });
      expect(captureResponse.statusCode).toBe(409);
      expect(captureResponse.json()).toMatchObject({
        code: "MTGA_NOT_RUNNING",
        error: "MTG Arena is not running. Open Arena and try again."
      });
    } finally {
      await unavailableApp.close();
    }
  });

  it("rejects a capture command that leaves the previous snapshot unchanged", async () => {
    mkdirSync(dirname(collectorSnapshotPath), { recursive: true });
    writeFileSync(collectorSnapshotPath, collectorSnapshotJson);
    const staleApp = buildApp(db, {
      untappedCatalogSource: "database",
      collectorCatalogSource: "database",
      directCaptureEnabled: true,
      collectorHelperOptions: {
        snapshotPath: collectorSnapshotPath,
        scryAddonPath: collectorAddonPath,
        codesignAvailable: true,
        mtgaPid: 11955,
        captureRunner: () => undefined
      }
    });
    try {
      const captureResponse = await staleApp.inject({
        method: "POST",
        url: "/api/imports/collector-helper/capture-preview"
      });
      expect(captureResponse.statusCode).toBe(422);
      expect(captureResponse.json()).toMatchObject({
        code: "CAPTURE_NOT_FRESH"
      });
    } finally {
      await staleApp.close();
    }
  });

  it("blocks collector imports when too few Arena entries match the catalog", async () => {
    const lowConfidenceSnapshot = JSON.stringify({
      ...(JSON.parse(collectorSnapshotJson) as Record<string, unknown>),
      entryCount: 3,
      totalQuantity: 6,
      collection: {
        8000001: 1,
        8000002: 2,
        8000003: 3
      }
    });
    const multipart = buildMultipartFilePayload(
      "low-confidence-collector.json",
      lowConfidenceSnapshot,
      "application/json"
    );

    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/imports/collector-snapshot/preview",
      payload: multipart.payload,
      headers: multipart.headers
    });
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toMatchObject({
      matchedGrpIds: 0,
      unmatchedGrpIds: 3
    });

    const importMultipart = buildMultipartFilePayload(
      "low-confidence-collector.json",
      lowConfidenceSnapshot,
      "application/json"
    );
    const importResponse = await app.inject({
      method: "POST",
      url: "/api/imports/collector-snapshot",
      payload: importMultipart.payload,
      headers: importMultipart.headers
    });
    expect(importResponse.statusCode).toBe(422);
    expect(importResponse.json()).toMatchObject({
      code: "COLLECTOR_CATALOG_MISMATCH"
    });
    const statusResponse = await app.inject({ method: "GET", url: "/api/status" });
    expect(statusResponse.json().collection.ownedCopies).toBe(0);
  });

  it("creates, validates, and exports decks", async () => {
    importCollectionCsv(db, validCollectionCsv);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/decks",
      payload: {
        name: "Blink Shell",
        format: "standard",
        cards: [
          { cardId: "oracle-angel", quantity: 2, section: "main" },
          { cardId: "oracle-necromancer", quantity: 1, section: "main" }
        ]
      }
    });

    expect(createResponse.statusCode).toBe(200);
    const deck = createResponse.json();

    const validationResponse = await app.inject({
      method: "POST",
      url: `/api/decks/${deck.id}/validate`
    });
    expect(validationResponse.statusCode).toBe(200);
    const validation = validationResponse.json();
    expect(validation.issues.some((issue: string) => issue.includes("at least 60"))).toBe(true);
    expect(validation.ownershipGaps).toEqual([]);

    const exportResponse = await app.inject({
      method: "GET",
      url: `/api/decks/${deck.id}/export/arena`
    });
    expect(exportResponse.statusCode).toBe(200);
    expect(exportResponse.json().text).toMatch(/^Deck\n/);
    expect(exportResponse.json().text).toContain("2 Angelic Blink (TST) 1");

    const bulkExportResponse = await app.inject({
      method: "GET",
      url: "/api/decks/exports/arena"
    });
    expect(bulkExportResponse.statusCode).toBe(200);
    expect(bulkExportResponse.json()).toMatchObject({
      deckCount: 1,
      decks: [
        {
          deckId: deck.id,
          name: "Blink Shell"
        }
      ]
    });
    expect(bulkExportResponse.json().text).toContain("Blink Shell");
    expect(bulkExportResponse.json().text).toContain("Deck\n2 Angelic Blink");
  });

  it("treats snow-covered basic lands as unlimited for deck ownership", async () => {
    syncCardsFromBulkData(db, [
      ...fixtureCards,
      {
        id: "print-basic-plains",
        oracle_id: "oracle-basic-plains",
        arena_id: 4003,
        name: "Snow-Covered Plains",
        oracle_text: "{T}: Add {W}.",
        mana_cost: null,
        cmc: 0,
        colors: [],
        color_identity: ["W"],
        type_line: "Basic Snow Land — Plains",
        rarity: "common",
        layout: "normal",
        keywords: [],
        legalities: {
          standard: "legal"
        },
        set: "TST",
        collector_number: "250",
        released_at: "2026-01-01",
        games: ["arena"]
      }
    ]);
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/decks",
      payload: {
        name: "Basic Land Test",
        format: "standard",
        cards: [
          {
            cardId: "oracle-basic-plains",
            quantity: 20,
            section: "main"
          }
        ]
      }
    });
    const deck = createResponse.json();
    expect(deck.cards[0].ownedCount).toBeNull();

    const validationResponse = await app.inject({
      method: "POST",
      url: `/api/decks/${deck.id}/validate`
    });
    expect(validationResponse.statusCode).toBe(200);
    expect(validationResponse.json().ownershipGaps).toEqual([]);
  });

  it("previews and idempotently syncs user-managed decks from Arena's Player.log", async () => {
    const previewResponse = await app.inject({
      method: "POST",
      url: "/api/decks/imports/arena-log/preview",
      payload: {}
    });
    expect(previewResponse.statusCode).toBe(200);
    expect(previewResponse.json()).toMatchObject({
      source: "arena-player-log",
      totalDecksFound: 3,
      userDecksFound: 2,
      starterDecksFound: 1,
      decksIncluded: 2,
      newDecks: 2,
      changedDecks: 0,
      placeholderCardCount: 1,
      specialFormatDecks: 1
    });

    const importResponse = await app.inject({
      method: "POST",
      url: "/api/decks/imports/arena-log",
      payload: {}
    });
    expect(importResponse.statusCode).toBe(200);
    expect(importResponse.json()).toMatchObject({
      decksCreated: 2,
      decksUpdated: 0
    });

    const listResponse = await app.inject({ method: "GET", url: "/api/decks" });
    const syncedDecks = listResponse
      .json()
      .items.filter((deck: { source: string }) => deck.source === "arena");
    expect(syncedDecks).toHaveLength(2);
    const standardDeck = syncedDecks.find(
      (deck: { externalId: string }) => deck.externalId === "arena-custom-standard"
    );
    expect(standardDeck).toMatchObject({
      name: "Logbook Standard",
      format: "standard",
      sourceFormat: "Standard",
      isFavorite: true,
      totalCards: 4
    });

    const deckResponse = await app.inject({
      method: "GET",
      url: `/api/decks/${standardDeck.id}`
    });
    expect(deckResponse.statusCode).toBe(200);
    expect(deckResponse.json().cards).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cardId: "oracle-angel", quantity: 2, section: "main" }),
        expect.objectContaining({
          cardId: "placeholder:arena-grpid-9999",
          quantity: 1,
          section: "main"
        }),
        expect.objectContaining({
          cardId: "oracle-necromancer",
          quantity: 1,
          section: "sideboard"
        })
      ])
    );

    const secondImportResponse = await app.inject({
      method: "POST",
      url: "/api/decks/imports/arena-log",
      payload: {}
    });
    expect(secondImportResponse.statusCode).toBe(200);
    expect(secondImportResponse.json()).toMatchObject({
      decksCreated: 0,
      decksUpdated: 0,
      unchangedDecks: 2
    });

    const starterPreviewResponse = await app.inject({
      method: "POST",
      url: "/api/decks/imports/arena-log/preview",
      payload: { includeStarterDecks: true }
    });
    expect(starterPreviewResponse.statusCode).toBe(200);
    expect(starterPreviewResponse.json()).toMatchObject({
      decksIncluded: 3,
      newDecks: 1
    });
  });

  it("filters format legality in search", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/cards/search?format=standard"
    });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.items.some((item: { name: string }) => item.name === "Dawnfall")).toBe(false);
  });

  it("treats restricted cards as playable and banned cards as unplayable for format search", async () => {
    syncCardsFromBulkData(db, [
      {
        id: "print-restricted",
        oracle_id: "oracle-restricted",
        arena_id: 3001,
        name: "Restricted Probe",
        oracle_text: "Add three mana.",
        mana_cost: "{0}",
        cmc: 0,
        colors: [],
        color_identity: [],
        type_line: "Artifact",
        rarity: "mythic",
        layout: "normal",
        keywords: [],
        legalities: {
          standard: "restricted"
        },
        set: "RSP",
        collector_number: "1",
        released_at: "2026-01-01",
        games: ["arena"]
      },
      {
        id: "print-banned",
        oracle_id: "oracle-banned",
        arena_id: 3002,
        name: "Banned Probe",
        oracle_text: "Take an extra turn.",
        mana_cost: "{1}{U}",
        cmc: 2,
        colors: ["U"],
        color_identity: ["U"],
        type_line: "Sorcery",
        rarity: "mythic",
        layout: "normal",
        keywords: [],
        legalities: {
          standard: "banned"
        },
        set: "RSP",
        collector_number: "2",
        released_at: "2026-01-01",
        games: ["arena"]
      }
    ]);

    const response = await app.inject({
      method: "GET",
      url: "/api/cards/search?format=standard"
    });

    expect(response.statusCode).toBe(200);
    const names = response.json().items.map((item: { name: string }) => item.name);
    expect(names).toContain("Restricted Probe");
    expect(names).not.toContain("Banned Probe");
  });
});
