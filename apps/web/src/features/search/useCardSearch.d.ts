import type { CardSummary } from "../../types";
import { type FilterState } from "../shared/filterState";
export declare const useCardSearch: (filters: FilterState, onError: (message: string) => void) => {
    cards: CardSummary[];
    cardsTotal: number;
    visibleResultsCount: number;
    setVisibleResultsCount: import("react").Dispatch<import("react").SetStateAction<number>>;
    searchLoading: boolean;
};
