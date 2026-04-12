import { useEffect, useState } from "react";

import { getCardStats } from "../../api";
import type { CardStatsResponse } from "../../types";
import { buildSearchParams, type FilterState } from "../shared/filterState";

export const useCardStats = (filters: FilterState, onError: (message: string) => void) => {
  const [cardStats, setCardStats] = useState<CardStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    const runStats = async () => {
      try {
        setStatsLoading(true);
        const response = await getCardStats(buildSearchParams(filters));
        setCardStats(response);
      } catch (error) {
        onError(error instanceof Error ? error.message : "Card stats failed.");
      } finally {
        setStatsLoading(false);
      }
    };

    void runStats();
  }, [filters, onError]);

  return {
    cardStats,
    statsLoading
  };
};
