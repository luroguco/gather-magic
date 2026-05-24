import type { ArenaFormat, Mechanic } from "../../types";
export declare const FORMATS: readonly [readonly ["standard", "Standard"], readonly ["alchemy", "Alchemy"], readonly ["explorer", "Explorer"], readonly ["historic", "Historic"], readonly ["timeless", "Timeless"], readonly ["brawl", "Brawl"], readonly ["standardbrawl", "Standard Brawl"]];
export declare const COLORS: readonly ["W", "U", "B", "R", "G"];
export declare const CARD_TYPES: readonly ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land"];
export declare const RARITIES: readonly ["common", "uncommon", "rare", "mythic"];
export declare const SEARCH_PAGE_SIZE = 50000;
export declare const INITIAL_VISIBLE_RESULTS = 120;
export declare const VISIBLE_RESULTS_STEP = 120;
export type FilterState = {
    q: string;
    format: ArenaFormat;
    colors: string[];
    mechanics: string[];
    types: string[];
    subtypes: string;
    rarity: string[];
    playableCountMin: string;
    playableCountMax: string;
    manaValueMin: string;
    manaValueMax: string;
    ownedOnly: boolean;
    drilldownKind: "" | StatsDrilldownKind;
    drilldownKey: string;
    drilldownLabel: string;
};
export type FilterStateUpdater = (updater: (current: FilterState) => FilterState) => void;
export type ResultsViewMode = "grid" | "list" | "table";
export type StatsDrilldownKind = "color" | "manaValue" | "type" | "subtype" | "tribe" | "rarity" | "set" | "mechanic";
export type MechanicSection = {
    id: string;
    label: string;
    items: Mechanic[];
};
export declare const defaultSearch: FilterState;
export declare const defaultStatsFilters: FilterState;
export declare const toggleValue: (values: string[], value: string) => string[];
export declare const buildSearchParams: (state: FilterState) => URLSearchParams;
export declare const mergeSharedFilterFields: (target: FilterState, source: FilterState) => FilterState;
export declare const clearDrilldownState: (state: FilterState) => FilterState;
export declare const groupDerivedMechanics: (items: Mechanic[]) => {
    id: string;
    label: string;
    items: Mechanic[];
}[];
export declare const groupKeywordMechanics: (items: Mechanic[]) => {
    id: string;
    label: string;
    items: Mechanic[];
}[];
