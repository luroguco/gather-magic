import type { Deck, DeckListItem, ValidationResult } from "../../types";
import { FORMATS } from "../shared/filterState";
import { DeckDisplayControls } from "./DeckDisplayControls";

type DeckDisplayCard = {
  cardId: string;
  section: "main" | "sideboard" | "commander";
  quantity: number;
  displayName: string;
  displayTypeLine: string;
  displayManaValue: number;
  displayOwnedCount: number;
};

type DeckCardGroup = {
  key: string;
  label: string;
  items: DeckDisplayCard[];
};

type DecksScreenProps = {
  deckList: DeckListItem[];
  activeDeck: Deck | null;
  deckName: string;
  deckFormat: Deck["format"];
  onDeckNameChange: (value: string) => void;
  onDeckFormatChange: (value: Deck["format"]) => void;
  onCreateDeck: () => void;
  onSelectDeck: (deckId: string) => void;
  onSaveDeck: (deck: Deck) => void;
  validation: ValidationResult | null;
  onRefreshValidation: (deckId: string) => Promise<void>;
  onRefreshExport: (deckId: string) => Promise<void>;
  exportText: string;
  deckSort: "added" | "name" | "manaValue" | "typeLine" | "quantity";
  deckGroup: "none" | "section" | "typeLine" | "manaValue";
  onDeckSortChange: (value: "added" | "name" | "manaValue" | "typeLine" | "quantity") => void;
  onDeckGroupChange: (value: "none" | "section" | "typeLine" | "manaValue") => void;
  sortedDeckDisplayCards: DeckDisplayCard[];
  deckCardGroups: DeckCardGroup[];
  onChangeDeckQuantity: (cardId: string, section: "main" | "sideboard" | "commander", delta: number) => void;
  onActiveDeckChange: (deck: Deck) => void;
};

export function DecksScreen({
  deckList,
  activeDeck,
  deckName,
  deckFormat,
  onDeckNameChange,
  onDeckFormatChange,
  onCreateDeck,
  onSelectDeck,
  onSaveDeck,
  validation,
  onRefreshValidation,
  onRefreshExport,
  exportText,
  deckSort,
  deckGroup,
  onDeckSortChange,
  onDeckGroupChange,
  sortedDeckDisplayCards,
  deckCardGroups,
  onChangeDeckQuantity,
  onActiveDeckChange
}: DecksScreenProps) {
  return (
    <div className="workspace-grid">
      <section className="panel deck-list-panel">
        <div className="panel-header">
          <h2>Decks</h2>
          <span>{deckList.length} saved</span>
        </div>

        <div className="deck-creator">
          <label className="field">
            <span>Name</span>
            <input value={deckName} onChange={(event) => onDeckNameChange(event.target.value)} />
          </label>
          <label className="field">
            <span>Format</span>
            <select value={deckFormat} onChange={(event) => onDeckFormatChange(event.target.value as Deck["format"])}>
              {FORMATS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" onClick={onCreateDeck} type="button">
            Create deck
          </button>
        </div>

        <div className="deck-list">
          {deckList.map((deck) => (
            <button className={activeDeck?.id === deck.id ? "deck-list-item active" : "deck-list-item"} key={deck.id} onClick={() => onSelectDeck(deck.id)} type="button">
              <strong>{deck.name}</strong>
              <span>{FORMATS.find(([value]) => value === deck.format)?.[1] ?? deck.format}</span>
              <small>{deck.totalCards} cards</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel deck-detail-panel">
        {activeDeck ? (
          <>
            <div className="panel-header">
              <div>
                <h2>{activeDeck.name}</h2>
                <span>{FORMATS.find(([value]) => value === activeDeck.format)?.[1]}</span>
              </div>
              <button className="ghost-button" onClick={() => onSaveDeck(activeDeck)} type="button">
                Save deck
              </button>
            </div>

            <label className="field">
              <span>Deck name</span>
              <input
                value={activeDeck.name}
                onChange={(event) =>
                  onActiveDeckChange({
                    ...activeDeck,
                    name: event.target.value
                  })
                }
              />
            </label>

            <label className="field">
              <span>Notes</span>
              <textarea
                rows={3}
                value={activeDeck.notes}
                onChange={(event) =>
                  onActiveDeckChange({
                    ...activeDeck,
                    notes: event.target.value
                  })
                }
              />
            </label>

            <DeckDisplayControls compact={false} deckSort={deckSort} deckGroup={deckGroup} onDeckSortChange={onDeckSortChange} onDeckGroupChange={onDeckGroupChange} />

            <div className="deck-card-list">
              {sortedDeckDisplayCards.length === 0 ? (
                <p className="empty-state">Start from the Search tab and add cards into this deck.</p>
              ) : (
                deckCardGroups.map((group) => (
                  <section className="deck-group" key={`detail-group-${group.key}`}>
                    {deckGroup !== "none" ? (
                      <div className="deck-group-header">
                        <strong>{group.label}</strong>
                        <span>{group.items.reduce((total, item) => total + item.quantity, 0)} cards</span>
                      </div>
                    ) : null}
                    {group.items.map((deckCard) => (
                      <div className="deck-card-row" key={`${deckCard.cardId}-${deckCard.section}`}>
                        <div className="cart-card-copy">
                          <strong>{deckCard.displayName}</strong>
                          <p>
                            {deckCard.section}
                            {deckCard.displayTypeLine ? ` · ${deckCard.displayTypeLine}` : ""}
                            {typeof deckCard.displayOwnedCount === "number" ? ` · own ${deckCard.displayOwnedCount}` : ""}
                          </p>
                        </div>
                        <div className="quantity-controls">
                          <button onClick={() => onChangeDeckQuantity(deckCard.cardId, deckCard.section, -1)} type="button">
                            -
                          </button>
                          <span>{deckCard.quantity}</span>
                          <button onClick={() => onChangeDeckQuantity(deckCard.cardId, deckCard.section, 1)} type="button">
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </section>
                ))
              )}
            </div>

            <div className="validation-grid">
              <div className="subpanel">
                <div className="panel-header">
                  <h3>Validation</h3>
                  <button className="ghost-button" onClick={() => void onRefreshValidation(activeDeck.id)} type="button">
                    Refresh
                  </button>
                </div>
                {validation?.issues.length ? (
                  <ul className="issue-list">
                    {validation.issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">No validation issues yet.</p>
                )}
              </div>

              <div className="subpanel">
                <div className="panel-header">
                  <h3>Ownership gaps</h3>
                  <button className="ghost-button" onClick={() => void onRefreshExport(activeDeck.id)} type="button">
                    Refresh export
                  </button>
                </div>
                {validation?.ownershipGaps.length ? (
                  <ul className="issue-list">
                    {validation.ownershipGaps.map((gap) => (
                      <li key={gap.cardId}>
                        {gap.name}: need {gap.needed}, own {gap.owned}, missing {gap.missing}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">No ownership gaps for the current list.</p>
                )}
              </div>
            </div>

            <div className="subpanel export-panel">
              <div className="panel-header">
                <h3>Arena Export</h3>
              </div>
              <textarea readOnly rows={12} value={exportText} />
            </div>
          </>
        ) : (
          <p className="empty-state">Create a deck to start building.</p>
        )}
      </section>
    </div>
  );
}
