import { useEffect, useState } from "react";
import { getCardStats } from "../../api";
import { buildSearchParams } from "../shared/filterState";
export const useCardStats = (filters, onError) => {
    const [cardStats, setCardStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(false);
    useEffect(() => {
        const runStats = async () => {
            try {
                setStatsLoading(true);
                const response = await getCardStats(buildSearchParams(filters));
                setCardStats(response);
            }
            catch (error) {
                onError(error instanceof Error ? error.message : "Card stats failed.");
            }
            finally {
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
