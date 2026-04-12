type DeckSortKey = "added" | "name" | "manaValue" | "typeLine" | "quantity";
type DeckGroupKey = "none" | "section" | "typeLine" | "manaValue";
type DeckDisplayControlsProps = {
    compact?: boolean;
    deckSort: DeckSortKey;
    deckGroup: DeckGroupKey;
    onDeckSortChange: (value: DeckSortKey) => void;
    onDeckGroupChange: (value: DeckGroupKey) => void;
};
export declare function DeckDisplayControls({ compact, deckSort, deckGroup, onDeckSortChange, onDeckGroupChange }: DeckDisplayControlsProps): import("react/jsx-runtime").JSX.Element;
export {};
