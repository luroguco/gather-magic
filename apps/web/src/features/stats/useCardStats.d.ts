import type { CardStatsResponse } from "../../types";
import { type FilterState } from "../shared/filterState";
export declare const useCardStats: (filters: FilterState, onError: (message: string) => void) => {
    cardStats: CardStatsResponse | null;
    statsLoading: boolean;
};
