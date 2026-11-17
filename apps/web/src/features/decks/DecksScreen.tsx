import { useEffect, useState } from "react";

import type {
  ArenaDeckSyncSummary,
  Deck,
  DeckListItem,
  ValidationResult
} from "../../types";
import { DECK_FORMATS } from "../shared/filterState";
import { DeckDisplayControls } from "./DeckDisplayControls";

type DeckDisplayCard = {
  cardId: string;
  section: "main" | "sideboard" | "commander";
  quantity: number;
  displayName: string;
  displayTypeLine: string;
  displayManaValue: number;
  displayOwnedCount: number | null | undefined;
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
  exportText: string;
  deckSort: "added" | "name" | "manaValue" | "typeLine" | "quantity";
  deckGroup: "none" | "section" | "typeLine" | "manaValue";
  onDeckSortChange: (value: "added" | "name" | "manaValue" | "typeLine" | "quantity") => void;
  onDeckGroupChange: (value: "none" | "section" | "typeLine" | "manaValue") => void;
  sortedDeckDisplayCards: DeckDisplayCard[];
  deckCardGroups: DeckCardGroup[];
  onChangeDeckQuantity: (cardId: string, section: "main" | "sideboard" | "commander", delta: number) => void;
  onActiveDeckChange: (deck: Deck) => void;
  arenaDeckPreview: ArenaDeckSyncSummary | null;
  arenaDeckPreviewLoading: boolean;
  arenaDeckSyncing: boolean;
  includeStarterDecks: boolean;
  onIncludeStarterDecksChange: (value: boolean) => void;
  onPreviewArenaDecks: () => void;
  onSyncArenaDecks: () => void;
  bulkExportLoading: boolean;
  bulkExportStatus: "idle" | "copied" | "downloaded";
  onCopyAllDecks: () => void;
  onDownloadAllDecks: () => void;
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
  exportText,
  deckSort,
  deckGroup,
  onDeckSortChange,
  onDeckGroupChange,
  sortedDeckDisplayCards,
  deckCardGroups,
  onChangeDeckQuantity,
  onActiveDeckChange,
  arenaDeckPreview,
  arenaDeckPreviewLoading,
  arenaDeckSyncing,
  includeStarterDecks,
  onIncludeStarterDecksChange,
  onPreviewArenaDecks,
  onSyncArenaDecks,
  bulkExportLoading,
  bulkExportStatus,
  onCopyAllDecks,
  onDownloadAllDecks
}: DecksScreenProps) {
  const [exportCopyStatus, setExportCopyStatus] = useState<
    "idle" | "copied" | "failed"
  >("idle");

  useEffect(() => {
    setExportCopyStatus("idle");
  }, [exportText]);

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setExportCopyStatus("copied");
    } catch {
      setExportCopyStatus("failed");
    }
  };

  return (
    <div className="workspace-grid">
      <section className="panel deck-list-panel">
        <div className="panel-header">
          <h2>Decks</h2>
          <span>{deckList.length} saved</span>
        </div>

        <div className="deck-bulk-tools">
          <strong>Export library</strong>
          <div>
            <button
              className="ghost-button"
              disabled={bulkExportLoading || deckList.length === 0}
              onClick={onCopyAllDecks}
              type="button"
            >
              {bulkExportStatus === "copied" ? "Copied all" : "Copy all"}
            </button>
            <button
              className="ghost-button"
              disabled={bulkExportLoading || deckList.length === 0}
              onClick={onDownloadAllDecks}
              type="button"
            >
              {bulkExportStatus === "downloaded" ? "Downloaded" : "Download bundle"}
            </button>
          </div>
          <small>All {deckList.length} decks, separated and labeled in one text bundle.</small>
        </div>

        <div className="deck-sync-card">
          <div className="deck-sync-heading">
            <div>
              <strong>Arena deck library</strong>
              <p>Read your saved decks directly from Arena. Local-only decks are never deleted.</p>
            </div>
            <button
              className="ghost-button"
              disabled={arenaDeckPreviewLoading || arenaDeckSyncing}
              onClick={onPreviewArenaDecks}
              type="button"
            >
              {arenaDeckPreviewLoading ? "Checking…" : arenaDeckPreview ? "Check again" : "Find decks"}
            </button>
          </div>

          <label className="deck-sync-option">
            <input
              checked={includeStarterDecks}
              disabled={arenaDeckPreviewLoading || arenaDeckSyncing}
              onChange={(event) => onIncludeStarterDecksChange(event.target.checked)}
              type="checkbox"
            />
            <span>Include Arena starter decks</span>
          </label>

          {arenaDeckPreview ? (
            <div className="deck-sync-preview" aria-live="polite">
              <div>
                <strong>{arenaDeckPreview.decksIncluded}</strong>
                <span>ready</span>
              </div>
              <div>
                <strong>{arenaDeckPreview.newDecks}</strong>
                <span>new</span>
              </div>
              <div>
                <strong>{arenaDeckPreview.changedDecks}</strong>
                <span>changed</span>
              </div>
              <div>
                <strong>{arenaDeckPreview.unchangedDecks}</strong>
                <span>current</span>
              </div>
              {arenaDeckPreview.placeholderCardCount > 0 ? (
                <p className="deck-sync-note">
                  {arenaDeckPreview.placeholderCardCount} Arena card{" "}
                  {arenaDeckPreview.placeholderCardCount === 1 ? "ID needs" : "IDs need"} a
                  temporary label; quantities will still be preserved.
                </p>
              ) : null}
              {arenaDeckPreview.specialFormatDecks > 0 ? (
                <p className="deck-sync-note">
                  {arenaDeckPreview.specialFormatDecks} limited or event{" "}
                  {arenaDeckPreview.specialFormatDecks === 1
                    ? "deck keeps its"
                    : "decks keep their"}{" "}
                  Arena format metadata.
                </p>
              ) : null}
              <button
                className="primary-button deck-sync-action"
                disabled={
                  arenaDeckSyncing ||
                  (arenaDeckPreview.newDecks === 0 && arenaDeckPreview.changedDecks === 0)
                }
                onClick={onSyncArenaDecks}
                type="button"
              >
                {arenaDeckSyncing
                  ? "Syncing…"
                  : arenaDeckPreview.newDecks === 0 && arenaDeckPreview.changedDecks === 0
                    ? "Already up to date"
                    : `Sync ${arenaDeckPreview.newDecks + arenaDeckPreview.changedDecks} deck${
                        arenaDeckPreview.newDecks + arenaDeckPreview.changedDecks === 1 ? "" : "s"
                      }`}
              </button>
            </div>
          ) : null}
        </div>

        <div className="deck-creator">
          <label className="field">
            <span>Name</span>
            <input value={deckName} onChange={(event) => onDeckNameChange(event.target.value)} />
          </label>
          <label className="field">
            <span>Format</span>
            <select value={deckFormat} onChange={(event) => onDeckFormatChange(event.target.value as Deck["format"])}>
              {DECK_FORMATS.map(([value, label]) => (
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
              <span>
                {DECK_FORMATS.find(([value]) => value === deck.format)?.[1] ?? deck.format}
                {deck.source === "arena" ? " · Arena" : ""}
              </span>
              <small>
                {deck.totalCards} cards{deck.isFavorite ? " · ★ favorite" : ""}
              </small>
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
                <span>
                  {DECK_FORMATS.find(([value]) => value === activeDeck.format)?.[1]}
                  {activeDeck.source === "arena" ? " · Synced from Arena" : ""}
                </span>
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
                            {deckCard.displayOwnedCount === null
                              ? " · unlimited"
                              : typeof deckCard.displayOwnedCount === "number"
                                ? ` · own ${deckCard.displayOwnedCount}`
                                : ""}
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
                {validation === null ? (
                  <p className="empty-state">Run validation to check this deck.</p>
                ) : validation.issues.length ? (
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
                  <button className="ghost-button" onClick={() => void onRefreshValidation(activeDeck.id)} type="button">
                    Check ownership
                  </button>
                </div>
                {validation === null ? (
                  <p className="empty-state">Check against your latest collection snapshot.</p>
                ) : validation.ownershipGaps.length ? (
                  <ul className="issue-list">
                    {validation.ownershipGaps.map((gap) => (
                      <li key={gap.cardId}>
                        {gap.name}: need {gap.needed}, own {gap.owned}, missing {gap.missing}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-state">You own every card needed for this deck.</p>
                )}
              </div>
            </div>

            <div className="subpanel export-panel">
              <div className="panel-header">
                <h3>Arena Export</h3>
                <div className="export-actions">
                  {exportCopyStatus === "failed" ? (
                    <span className="export-copy-error" role="alert">
                      Copy failed
                    </span>
                  ) : null}
                  <button
                    className="ghost-button"
                    disabled={!exportText}
                    onClick={() => void handleCopyExport()}
                    type="button"
                  >
                    {exportCopyStatus === "copied" ? "Copied" : "Export deck"}
                  </button>
                </div>
              </div>
              <textarea
                aria-label="Arena export code"
                readOnly
                rows={12}
                value={exportText}
              />
            </div>
          </>
        ) : (
          <p className="empty-state">Create a deck to start building.</p>
        )}
      </section>
    </div>
  );
}
