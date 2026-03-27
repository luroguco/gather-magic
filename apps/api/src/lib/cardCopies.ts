const wordNumberMap: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12
};

const parseWordNumber = (value: string) => wordNumberMap[value.toLowerCase()] ?? null;

export const getDeckBuildingLimit = (oracleText: string, typeLine: string): number | null => {
  if (typeLine.toLowerCase().includes("basic land")) {
    return null;
  }

  const normalizedText = oracleText.toLowerCase();

  if (normalizedText.includes("a deck can have any number of cards named")) {
    return null;
  }

  const digitMatch = normalizedText.match(/a deck can have up to (\d+) cards named/);
  if (digitMatch?.[1]) {
    return Number.parseInt(digitMatch[1], 10);
  }

  const wordMatch = normalizedText.match(/a deck can have up to ([a-z]+) cards named/);
  if (wordMatch?.[1]) {
    return parseWordNumber(wordMatch[1]);
  }

  return 4;
};

export const getOwnedCountView = (rawOwnedCount: number, oracleText: string, typeLine: string) => {
  const deckBuildingLimit = getDeckBuildingLimit(oracleText, typeLine);
  return {
    rawOwnedCount,
    playableOwnedCount:
      deckBuildingLimit === null ? rawOwnedCount : Math.min(rawOwnedCount, deckBuildingLimit),
    deckBuildingLimit
  };
};
