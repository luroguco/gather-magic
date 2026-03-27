import { createDatabase } from "../lib/database.js";
import { fetchBulkData, readBulkDataFromFile, syncCardsFromBulkData } from "../services/cardData.js";

const db = createDatabase();

const run = async () => {
  const fileArg = process.argv[2];
  const cards = fileArg ? await readBulkDataFromFile(fileArg) : await fetchBulkData();
  const result = syncCardsFromBulkData(db, cards);
  console.log(`Synced ${result.cardCount} cards across ${result.printCount} Arena printings.`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
