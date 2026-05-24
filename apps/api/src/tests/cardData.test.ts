import { describe, expect, it } from "vitest";
import { normalizeLegalities, syncCardsFromBulkData } from "../services/cardData.js";
import { createDatabase } from "../lib/database.js";

describe("Scryfall legality normalization", () => {
  it("preserves known legality statuses and defaults missing Arena formats to not_legal", () => {
    expect(
      normalizeLegalities({
        standard: "legal",
        historic: "restricted",
        timeless: "banned",
        modern: "legal",
        mystery: "unexpected"
      })
    ).toMatchObject({
      standard: "legal",
      alchemy: "not_legal",
      explorer: "not_legal",
      historic: "restricted",
      timeless: "banned",
      brawl: "not_legal",
      standardbrawl: "not_legal",
      modern: "legal",
      mystery: "not_legal"
    });
  });

  it("stores normalized legalities and Scryfall source metadata during sync", () => {
    const db = createDatabase(":memory:");

    const result = syncCardsFromBulkData(
      db,
      [
        {
          id: "print-legality",
          oracle_id: "oracle-legality",
          arena_id: 98337,
          name: "Legality Probe",
          oracle_text: "Draw a card.",
          mana_cost: "{U}",
          cmc: 1,
          colors: ["U"],
          color_identity: ["U"],
          type_line: "Instant",
          rarity: "common",
          layout: "normal",
          keywords: [],
          legalities: {
            standard: "unexpected",
            historic: "restricted",
            modern: "legal"
          },
          set: "ECL",
          collector_number: "54",
          released_at: "2026-01-01",
          games: ["arena"],
          image_uris: {
            normal: "https://example.com/legality.png"
          }
        }
      ],
      undefined,
      {
        source: "scryfall-default-cards",
        sourceUpdatedAt: "2026-05-23T00:00:00.000Z",
        downloadUri: "https://example.com/default-cards.json"
      }
    );

    const cardRow = db
      .prepare("SELECT legalities_json FROM cards WHERE id = ?")
      .get("oracle-legality") as { legalities_json: string } | undefined;
    const legalities = JSON.parse(cardRow?.legalities_json ?? "{}") as Record<string, string>;
    expect(legalities).toMatchObject({
      standard: "not_legal",
      alchemy: "not_legal",
      explorer: "not_legal",
      historic: "restricted",
      timeless: "not_legal",
      brawl: "not_legal",
      standardbrawl: "not_legal",
      modern: "legal"
    });

    const syncRow = db.prepare("SELECT * FROM card_data_syncs WHERE source = ?").get("scryfall-default-cards") as
      | {
          source_updated_at: string | null;
          download_uri: string | null;
          card_count: number;
          print_count: number;
        }
      | undefined;

    expect(result.syncMetadata?.sourceUpdatedAt).toBe("2026-05-23T00:00:00.000Z");
    expect(syncRow).toMatchObject({
      source_updated_at: "2026-05-23T00:00:00.000Z",
      download_uri: "https://example.com/default-cards.json",
      card_count: 1,
      print_count: 1
    });
    db.close();
  });
});

describe("MTGJSON arena id supplementation", () => {
  it("fills missing arena ids from MTGJSON identifiers", () => {
    const db = createDatabase(":memory:");

    syncCardsFromBulkData(
      db,
      [
        {
          id: "print-keep-out",
          oracle_id: "oracle-keep-out",
          arena_id: null,
          name: "Keep Out",
          oracle_text: "Counter target spell unless its controller pays {2}.",
          mana_cost: "{1}{U}",
          cmc: 2,
          colors: ["U"],
          color_identity: ["U"],
          type_line: "Instant",
          rarity: "common",
          layout: "normal",
          keywords: [],
          legalities: {
            standard: "legal",
            alchemy: "legal",
            explorer: "legal",
            historic: "legal",
            timeless: "legal",
            brawl: "legal",
            standardbrawl: "legal"
          },
          set: "ECL",
          collector_number: "53",
          released_at: "2026-01-01",
          games: ["arena"],
          image_uris: {
            normal: "https://example.com/keep-out.png"
          }
        }
      ],
      {
        data: {
          ECL: {
            code: "ECL",
            cards: [
              {
                setCode: "ECL",
                number: "53",
                identifiers: {
                  mtgArenaId: "98336",
                  scryfallId: "print-keep-out"
                }
              }
            ]
          }
        }
      }
    );

    const row = db
      .prepare("SELECT arena_id FROM card_prints WHERE print_id = ?")
      .get("print-keep-out") as { arena_id: number | null } | undefined;

    expect(row?.arena_id).toBe(98336);
    db.close();
  });
});
