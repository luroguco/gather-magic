import { useEffect, useState } from "react";

import { searchCards } from "../../api";
import type { CardSummary } from "../../types";
import { INITIAL_VISIBLE_RESULTS, buildSearchParams, type FilterState } from "../shared/filterState";

export const useCardSearch = (filters: FilterState, onError: (message: string) => void) => {
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [cardsTotal, setCardsTotal] = useState(0);
  const [visibleResultsCount, setVisibleResultsCount] = useState(INITIAL_VISIBLE_RESULTS);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const runSearch = async () => {
      try {
        setSearchLoading(true);
        const response = await searchCards(buildSearchParams(filters));
        setCards(response.items);
        setCardsTotal(response.total);
        setVisibleResultsCount(Math.min(response.items.length, INITIAL_VISIBLE_RESULTS));
      } catch (error) {
        onError(error instanceof Error ? error.message : "Card search failed.");
      } finally {
        setSearchLoading(false);
      }
    };

    void runSearch();
  }, [filters, onError]);

  return {
    cards,
    cardsTotal,
    visibleResultsCount,
    setVisibleResultsCount,
    searchLoading
  };
};
