import type { CardStatsResponse, Mechanic } from "../../types";
import { type FilterState, type FilterStateUpdater, type MechanicSection } from "../shared/filterState";
type StatsScreenProps = {
    statsState: FilterState;
    updateStatsFilters: FilterStateUpdater;
    selectedStatsMechanics: Mechanic[];
    sidebarFavorites: Mechanic[];
    sidebarDerivedGroups: MechanicSection[];
    sidebarMechanicSelection: string[];
    onToggleMechanic: (slug: string) => void;
    onOpenGlossary: () => void;
    cardStats: CardStatsResponse | null;
    statsLoading: boolean;
    onOpenStatsSearchView: () => void;
    onOpenStatsDrilldown: (kind: "color" | "manaValue" | "type" | "rarity" | "set" | "mechanic", item: CardStatsResponse["breakdowns"]["colors"][number]) => void;
};
export declare function StatsScreen({ statsState, updateStatsFilters, selectedStatsMechanics, sidebarFavorites, sidebarDerivedGroups, sidebarMechanicSelection, onToggleMechanic, onOpenGlossary, cardStats, statsLoading, onOpenStatsSearchView, onOpenStatsDrilldown }: StatsScreenProps): import("react/jsx-runtime").JSX.Element;
export {};
