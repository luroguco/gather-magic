import type { StatsBreakdownItem } from "../../types";
import { type FilterState, type FilterStateUpdater, type StatsDrilldownKind } from "./filterState";
type StatsSearchViewOptions = {
    drilldownKind?: StatsDrilldownKind;
    drilldownKey?: string;
    drilldownLabel?: string;
};
export declare const useSyncedCardFilters: () => {
    searchState: FilterState;
    setSearchState: import("react").Dispatch<import("react").SetStateAction<FilterState>>;
    deferredSearchState: FilterState;
    statsState: FilterState;
    setStatsState: import("react").Dispatch<import("react").SetStateAction<FilterState>>;
    deferredStatsState: FilterState;
    updateSearchFilters: FilterStateUpdater;
    updateStatsFilters: FilterStateUpdater;
    openStatsSearchView: (options?: StatsSearchViewOptions) => FilterState;
    openStatsDrilldown: (drilldownKind: StatsDrilldownKind, item: StatsBreakdownItem) => FilterState;
};
export {};
