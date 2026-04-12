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
  let collectorSnapshotPath: string;
  let collectorAddonPath: string;

  beforeEach(() => {
    db = createDatabase(":memory:");
    syncCardsFromBulkData(db, [...fixtureCards]);
    helperRoot = mkdtempSync(resolve(tmpdir(), "mtga-untapped-helper-"));
    untappedConfigPath = resolve(helperRoot, "config.json");
    untappedDownloadsPath = resolve(helperRoot, "Downloads");
    collectorSnapshotPath = resolve(helperRoot, "collector/latest-collector-snapshot.json");
    collectorAddonPath = resolve(helperRoot, "untapped-scry.node");
    mkdirSync(untappedDownloadsPath, { recursive: true });
    writeFileSync(untappedConfigPath, JSON.stringify({ showDevTools: false }, null, 2));
    writeFileSync(collectorAddonPath, "test-addon");
    app = buildApp(db, {
      untappedCatalogSource: "database",
      untappedConfigPath,
      untappedDownloadsPath,
      collectorHelperOptions: {
        snapshotPath: collectorSnapshotPath,
        scryAddonPath: collectorAddonPath,
        codesignAvailable: true,
        mtgaPid: 11955,
        captureRunner: (snapshotPath) => {
          mkdirSync(dirname(snapshotPath), { recursive: true });
          writeFileSync(snapshotPath, collectorSnapshotJson);
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
    expect(payload.snippet).toContain("mtga.collection.invoke");
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
    expect(previewPayload.ownedTitles).toBe(2);
    expect(previewPayload.ownedCopies).toBe(3);

    const importResponse = await app.inject({
      method: "POST",
      url: "/api/imports/untapped-helper/import-latest"
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
      capturedAt: "2026-04-03T02:15:00.000Z",
      platform: "darwin",
      collectorVersion: "0.1.0",
      mtgaPid: 11955,
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

  it("captures, previews, and imports the latest collector snapshot through the local helper", async () => {
    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/imports/collector-helper/status"
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toMatchObject({
      available: true,
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
      url: "/api/imports/collector-helper/import-latest"
    });

    expect(importLatestResponse.statusCode).toBe(200);
    const importLatestPayload = importLatestResponse.json();
    expect(typeof importLatestPayload.importedAt).toBe("string");
    expect(importLatestPayload.capture.filename).toBe("latest-collector-snapshot.json");
    expect(importLatestPayload.ownedTitles).toBe(2);
    expect(importLatestPayload.ownedCopies).toBe(3);
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
    expect(exportResponse.json().text).toContain("2 Angelic Blink (TST) 1");
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
});
