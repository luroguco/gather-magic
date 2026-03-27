import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DbHandle } from "../lib/database.js";
import { createDatabase } from "../lib/database.js";
import { buildApp } from "../app.js";
import { importCollectionCsv } from "../services/collectionImport.js";
import { syncCardsFromBulkData } from "../services/cardData.js";
import { duplicateVariantCollectionCsv, fixtureCards, validCollectionCsv } from "./fixtures.js";

describe("MTGA collection API", () => {
  let db: DbHandle;
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    syncCardsFromBulkData(db, [...fixtureCards]);
    app = buildApp(db);
  });

  afterEach(async () => {
    await app.close();
    db.close();
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
