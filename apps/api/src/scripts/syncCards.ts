import { createDatabase } from "../lib/database.js";
import {
  collectArenaRelevantSetCodes,
  fetchBulkDataWithMetadata,
  fetchMtgJsonSetIdentifiersForCards,
  readBulkDataFromFile,
  readMtgJsonAllIdentifiersFromFile,
  syncCardsFromBulkData
} from "../services/cardData.js";

const db = createDatabase();

type CliOptions = {
  scryfallFile?: string;
  mtgJsonFile?: string;
  skipMtgJson: boolean;
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    skipMtgJson: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (typeof arg !== "string") {
      continue;
    }

    if (arg === "--scryfall-file" && nextArg) {
      options.scryfallFile = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--mtgjson-file" && nextArg) {
      options.mtgJsonFile = nextArg;
      index += 1;
      continue;
    }

    if (arg === "--skip-mtgjson") {
      options.skipMtgJson = true;
      continue;
    }

    if (!arg.startsWith("--") && !options.scryfallFile) {
      options.scryfallFile = arg;
    }
  }

  return options;
};

const run = async () => {
  const options = parseArgs(process.argv.slice(2));
  const bulkData = options.scryfallFile
    ? {
        cards: await readBulkDataFromFile(options.scryfallFile),
        source: {
          source: "scryfall-default-cards",
          sourceUpdatedAt: null,
          downloadUri: options.scryfallFile
        }
      }
    : await fetchBulkDataWithMetadata();
  const cards = bulkData.cards;
  const mtgJsonSetCodes = options.skipMtgJson ? [] : collectArenaRelevantSetCodes(cards);
  const mtgJsonIdentifiers = options.skipMtgJson
    ? undefined
    : options.mtgJsonFile
      ? await readMtgJsonAllIdentifiersFromFile(options.mtgJsonFile)
      : await fetchMtgJsonSetIdentifiersForCards(cards);

  const result = syncCardsFromBulkData(db, cards, mtgJsonIdentifiers, bulkData.source);
  console.log(`Synced ${result.cardCount} cards across ${result.printCount} Arena printings.`);
  if (result.syncMetadata) {
    console.log(
      `Stored ${result.syncMetadata.source} sync metadata from ${result.syncMetadata.sourceUpdatedAt ?? "unknown source date"}.`
    );
  }
  if (!options.skipMtgJson) {
    console.log(`Fetched MTGJSON set supplements for ${mtgJsonSetCodes.length} Arena-relevant set codes.`);
    console.log(
      `Supplemented ${result.supplementedArenaIdCount} missing Arena ids from MTGJSON (${result.supplementedArenaIdByScryfallIdCount} by Scryfall id, ${result.supplementedArenaIdBySetCollectorCount} by set/collector, ${result.skippedConflictingArenaIdCount} skipped conflicts).`
    );
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
