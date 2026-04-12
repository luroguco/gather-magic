type DeckSortKey = "added" | "name" | "manaValue" | "typeLine" | "quantity";
type DeckGroupKey = "none" | "section" | "typeLine" | "manaValue";

type DeckDisplayControlsProps = {
  compact?: boolean;
  deckSort: DeckSortKey;
  deckGroup: DeckGroupKey;
  onDeckSortChange: (value: DeckSortKey) => void;
  onDeckGroupChange: (value: DeckGroupKey) => void;
};

export function DeckDisplayControls({
  compact = false,
  deckSort,
  deckGroup,
  onDeckSortChange,
  onDeckGroupChange
}: DeckDisplayControlsProps) {
  return (
    <div className={compact ? "deck-display-toolbar compact" : "deck-display-toolbar"}>
      <label className="field inline-field">
        <span>Sort</span>
        <select value={deckSort} onChange={(event) => onDeckSortChange(event.target.value as DeckSortKey)}>
          <option value="added">Added</option>
          <option value="name">Name</option>
          <option value="manaValue">Cost</option>
          <option value="typeLine">Type</option>
          <option value="quantity">Quantity</option>
        </select>
      </label>
      <label className="field inline-field">
        <span>Group</span>
        <select value={deckGroup} onChange={(event) => onDeckGroupChange(event.target.value as DeckGroupKey)}>
          <option value="section">Section</option>
          <option value="typeLine">Type</option>
          <option value="manaValue">Cost</option>
          <option value="none">None</option>
        </select>
      </label>
    </div>
  );
}
