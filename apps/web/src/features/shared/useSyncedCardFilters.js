import { useDeferredValue, useState } from "react";
import { defaultSearch, defaultStatsFilters, mergeSharedFilterFields } from "./filterState";
export const useSyncedCardFilters = () => {
    const [searchState, setSearchState] = useState(defaultSearch);
    const [statsState, setStatsState] = useState(defaultStatsFilters);
    const deferredSearchState = useDeferredValue(searchState);
    const deferredStatsState = useDeferredValue(statsState);
    const updateSearchFilters = (updater) => {
        setSearchState((current) => {
            const next = updater(current);
            setStatsState((other) => mergeSharedFilterFields(other, next));
            return next;
        });
    };
    const updateStatsFilters = (updater) => {
        setStatsState((current) => {
            const next = updater(current);
            setSearchState((other) => mergeSharedFilterFields(other, next));
            return next;
        });
    };
    const openStatsSearchView = (options) => {
        const drilldownKind = options?.drilldownKind ?? "";
        const nextSearchState = {
            ...mergeSharedFilterFields(defaultSearch, statsState),
            ownedOnly: statsState.ownedOnly,
            drilldownKind,
            drilldownKey: options?.drilldownKey ?? "",
            drilldownLabel: options?.drilldownLabel ?? ""
        };
        setSearchState(nextSearchState);
        return nextSearchState;
    };
    const openStatsDrilldown = (drilldownKind, item) => openStatsSearchView({
        drilldownKind,
        drilldownKey: item.key,
        drilldownLabel: item.label
    });
    return {
        searchState,
        setSearchState,
        deferredSearchState,
        statsState,
        setStatsState,
        deferredStatsState,
        updateSearchFilters,
        updateStatsFilters,
        openStatsSearchView,
        openStatsDrilldown
    };
};
