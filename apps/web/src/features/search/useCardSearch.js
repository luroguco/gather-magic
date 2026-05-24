import { useEffect, useRef, useState } from "react";
import { searchCards } from "../../api";
import { INITIAL_VISIBLE_RESULTS, buildSearchParams } from "../shared/filterState";
export const useCardSearch = (filters, onError) => {
    const [cards, setCards] = useState([]);
    const [cardsTotal, setCardsTotal] = useState(0);
    const [visibleResultsCount, setVisibleResultsCount] = useState(INITIAL_VISIBLE_RESULTS);
    const [searchLoading, setSearchLoading] = useState(false);
    const onErrorRef = useRef(onError);
    useEffect(() => {
        onErrorRef.current = onError;
    }, [onError]);
    useEffect(() => {
        let active = true;
        const runSearch = async () => {
            try {
                setSearchLoading(true);
                const response = await searchCards(buildSearchParams(filters));
                if (active) {
                    setCards(response.items);
                    setCardsTotal(response.total);
                    setVisibleResultsCount(Math.min(response.items.length, INITIAL_VISIBLE_RESULTS));
                }
            }
            catch (error) {
                onErrorRef.current(error instanceof Error ? error.message : "Card search failed.");
            }
            finally {
                if (active) {
                    setSearchLoading(false);
                }
            }
        };
        void runSearch();
        return () => {
            active = false;
        };
    }, [filters]);
    return {
        cards,
        cardsTotal,
        visibleResultsCount,
        setVisibleResultsCount,
        searchLoading
    };
};
