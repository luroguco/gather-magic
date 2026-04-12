import { useDeferredValue, useState } from "react";

import type { StatsBreakdownItem } from "../../types";
import {
  defaultSearch,
  defaultStatsFilters,
  mergeSharedFilterFields,
  type FilterState,
  type FilterStateUpdater,
  type StatsDrilldownKind
} from "./filterState";

type StatsSearchViewOptions = {
  drilldownKind?: StatsDrilldownKind;
  drilldownKey?: string;
  drilldownLabel?: string;
};

export const useSyncedCardFilters = () => {
  const [searchState, setSearchState] = useState(defaultSearch);
  const [statsState, setStatsState] = useState(defaultStatsFilters);
  const deferredSearchState = useDeferredValue(searchState);
  const deferredStatsState = useDeferredValue(statsState);

  const updateSearchFilters: FilterStateUpdater = (updater) => {
    setSearchState((current) => {
      const next = updater(current);
      setStatsState((other) => mergeSharedFilterFields(other, next));
      return next;
    });
  };

  const updateStatsFilters: FilterStateUpdater = (updater) => {
    setStatsState((current) => {
      const next = updater(current);
      setSearchState((other) => mergeSharedFilterFields(other, next));
      return next;
    });
  };

  const openStatsSearchView = (options?: StatsSearchViewOptions): FilterState => {
    const drilldownKind: FilterState["drilldownKind"] = options?.drilldownKind ?? "";
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

  const openStatsDrilldown = (drilldownKind: StatsDrilldownKind, item: StatsBreakdownItem) =>
    openStatsSearchView({
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
