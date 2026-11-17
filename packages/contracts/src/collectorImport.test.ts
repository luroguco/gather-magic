import { describe, expect, it } from "vitest";

import {
  MIN_COLLECTOR_CATALOG_MATCH_RATE,
  isCollectorCatalogMatchSafe
} from "./collectorImport.js";

describe("collector import confidence", () => {
  it("requires at least one match and the minimum match rate", () => {
    expect(MIN_COLLECTOR_CATALOG_MATCH_RATE).toBe(0.5);
    expect(isCollectorCatalogMatchSafe({ rawEntryCount: 0, matchedGrpIds: 0 })).toBe(false);
    expect(isCollectorCatalogMatchSafe({ rawEntryCount: 10, matchedGrpIds: 0 })).toBe(false);
    expect(isCollectorCatalogMatchSafe({ rawEntryCount: 10, matchedGrpIds: 4 })).toBe(false);
    expect(isCollectorCatalogMatchSafe({ rawEntryCount: 10, matchedGrpIds: 5 })).toBe(true);
  });
});
