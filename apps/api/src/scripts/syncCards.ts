import { createDatabase } from "../lib/database.js";
import {
  collectArenaRelevantSetCodes,
  fetchBulkData,
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
  const cards = options.scryfallFile ? await readBulkDataFromFile(options.scryfallFile) : await fetchBulkData();
  const mtgJsonSetCodes = options.skipMtgJson ? [] : collectArenaRelevantSetCodes(cards);
  const mtgJsonIdentifiers = options.skipMtgJson
    ? undefined
    : options.mtgJsonFile
      ? await readMtgJsonAllIdentifiersFromFile(options.mtgJsonFile)
      : await fetchMtgJsonSetIdentifiersForCards(cards);

  const result = syncCardsFromBulkData(db, cards, mtgJsonIdentifiers);
  console.log(`Synced ${result.cardCount} cards across ${result.printCount} Arena printings.`);
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
