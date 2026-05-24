import { useEffect, useRef, useState } from "react";

import { getCardStats } from "../../api";
import type { CardStatsResponse } from "../../types";
import { buildSearchParams, type FilterState } from "../shared/filterState";

export const useCardStats = (filters: FilterState, onError: (message: string) => void) => {
  const [cardStats, setCardStats] = useState<CardStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    let active = true;

    const runStats = async () => {
      try {
        setStatsLoading(true);
        const response = await getCardStats(buildSearchParams(filters));
        if (active) {
          setCardStats(response);
        }
      } catch (error) {
        onErrorRef.current(error instanceof Error ? error.message : "Card stats failed.");
      } finally {
        if (active) {
          setStatsLoading(false);
        }
      }
    };

    void runStats();
    return () => {
      active = false;
    };
  }, [filters]);

  return {
    cardStats,
    statsLoading
  };
};
