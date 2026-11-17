import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchBulkDataWithMetadata,
  normalizeLegalities,
  syncCardsFromBulkData
} from "../services/cardData.js";
import { createDatabase } from "../lib/database.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const bulkCard = {
  id: "print-streamed",
  oracle_id: "oracle-streamed",
  arena_id: 103470,
  name: "Dori, Bearer of Friends",
  legalities: {
    standard: "legal"
  },
  set: "hob",
  collector_number: "94",
  games: ["arena"]
};

describe("Scryfall bulk downloads", () => {
  it("streams the current gzipped JSONL bulk format", async () => {
    const downloadUri = "https://data.scryfall.io/default-cards/current.jsonl.gz";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                type: "default_cards",
                updated_at: "2026-08-17T21:05:31.424+00:00",
                jsonl_download_uri: downloadUri
              }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          gzipSync(Buffer.from(`${JSON.stringify(bulkCard)}\n${JSON.stringify({
            ...bulkCard,
            id: "print-streamed-two",
            name: "Esgaroth Garrison"
          })}`)),
          {
            status: 200,
            headers: {
              "Content-Type": "application/gzip"
            }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBulkDataWithMetadata();

    expect(result.cards.map((card) => card.name)).toEqual([
      "Dori, Bearer of Friends",
      "Esgaroth Garrison"
    ]);
    expect(result.source).toEqual({
      source: "scryfall-default-cards",
      sourceUpdatedAt: "2026-08-17T21:05:31.424+00:00",
      downloadUri
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retains support for the legacy JSON-array bulk format", async () => {
    const downloadUri = "https://data.scryfall.io/default-cards/legacy.json";
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                type: "default_cards",
                updated_at: "2026-07-27T09:09:45.872+00:00",
                download_uri: downloadUri
              }
            ]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([bulkCard]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchBulkDataWithMetadata();

    expect(result.cards).toEqual([bulkCard]);
    expect(result.source).toEqual({
      source: "scryfall-default-cards",
      sourceUpdatedAt: "2026-07-27T09:09:45.872+00:00",
      downloadUri
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

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
          produced_mana: ["U"],
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
      .prepare(
        "SELECT legalities_json, produced_mana_json FROM cards WHERE id = ?"
      )
      .get("oracle-legality") as
      | { legalities_json: string; produced_mana_json: string }
      | undefined;
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
    expect(JSON.parse(cardRow?.produced_mana_json ?? "[]")).toEqual(["U"]);

    expect(
      db
        .prepare("SELECT rarity FROM card_prints WHERE card_id = ?")
        .get("oracle-legality")
    ).toEqual({ rarity: "common" });

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

describe("Scryfall print normalization", () => {
  it("deduplicates localized print keys while preserving the most Arena-relevant record", () => {
    const db = createDatabase(":memory:");
    const baseCard = {
      oracle_id: "oracle-localized",
      name: "Localized Showcase",
      legalities: {
        standard: "legal"
      },
      set: "TST",
      collector_number: "101",
      released_at: "2026-11-01",
      games: ["paper"]
    };

    const result = syncCardsFromBulkData(db, [
      {
        ...baseCard,
        id: "print-ja",
        lang: "ja"
      },
      {
        ...baseCard,
        id: "print-en",
        lang: "en"
      },
      {
        ...baseCard,
        id: "print-arena-ja",
        oracle_id: "oracle-arena-localized",
        arena_id: 123456,
        lang: "ja",
        games: ["arena"]
      },
      {
        ...baseCard,
        id: "print-paper-en",
        oracle_id: "oracle-arena-localized",
        lang: "en"
      }
    ]);

    expect(result.printCount).toBe(2);
    expect(
      db
        .prepare(
          "SELECT print_id, arena_id FROM card_prints ORDER BY card_id"
        )
        .all()
    ).toEqual([
      { print_id: "print-arena-ja", arena_id: 123456 },
      { print_id: "print-en", arena_id: null }
    ]);
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
