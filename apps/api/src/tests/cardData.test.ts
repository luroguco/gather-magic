import { describe, expect, it } from "vitest";
import { syncCardsFromBulkData } from "../services/cardData.js";
import { createDatabase } from "../lib/database.js";

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
