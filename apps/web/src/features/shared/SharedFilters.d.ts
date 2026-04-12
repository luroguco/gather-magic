import type { Mechanic } from "../../types";
import { type FilterState, type FilterStateUpdater, type MechanicSection } from "./filterState";
type SharedFiltersProps = {
    state: FilterState;
    updateState: FilterStateUpdater;
    ownedLabel: string;
    ownedHintOn: string;
    ownedHintOff: string;
    onClear: () => void;
    selectedMechanics: Mechanic[];
    sidebarFavorites: Mechanic[];
    sidebarDerivedGroups: MechanicSection[];
    sidebarMechanicSelection: string[];
    onToggleMechanic: (slug: string) => void;
    onOpenGlossary: () => void;
};
export declare function SharedFilters({ state, updateState, ownedLabel, ownedHintOn, ownedHintOff, onClear, selectedMechanics, sidebarFavorites, sidebarDerivedGroups, sidebarMechanicSelection, onToggleMechanic, onOpenGlossary }: SharedFiltersProps): import("react/jsx-runtime").JSX.Element;
export {};
