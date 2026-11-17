export const MIN_COLLECTOR_CATALOG_MATCH_RATE = 0.5;

export const isCollectorCatalogMatchSafe = ({
  rawEntryCount,
  matchedGrpIds
}: {
  rawEntryCount: number;
  matchedGrpIds: number;
}) =>
  rawEntryCount > 0 &&
  matchedGrpIds > 0 &&
  matchedGrpIds / rawEntryCount >= MIN_COLLECTOR_CATALOG_MATCH_RATE;
