import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSyncedCardFilters } from "./useSyncedCardFilters";
const rarityBreakdown = {
    key: "rare",
    label: "Rare",
    titleCount: 7,
    playableOwnedCopies: 14,
    rawOwnedCopies: 16
};
describe("useSyncedCardFilters", () => {
    it("opens a stats drilldown in search while preserving the current stats filters", () => {
        const { result } = renderHook(() => useSyncedCardFilters());
        act(() => {
            result.current.updateStatsFilters((current) => ({
                ...current,
                q: "angel",
                format: "alchemy",
                colors: ["W"],
                rarity: ["rare"],
                ownedOnly: true
            }));
        });
        act(() => {
            result.current.openStatsDrilldown("rarity", rarityBreakdown);
        });
        expect(result.current.searchState.q).toBe("angel");
        expect(result.current.searchState.format).toBe("alchemy");
        expect(result.current.searchState.colors).toEqual(["W"]);
        expect(result.current.searchState.rarity).toEqual(["rare"]);
        expect(result.current.searchState.ownedOnly).toBe(true);
        expect(result.current.searchState.drilldownKind).toBe("rarity");
        expect(result.current.searchState.drilldownKey).toBe("rare");
        expect(result.current.searchState.drilldownLabel).toBe("Rare");
    });
});
