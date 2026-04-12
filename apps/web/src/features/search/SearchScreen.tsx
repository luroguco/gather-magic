import type { ReactNode } from "react";

import {
  CardCornerVisual,
  CardMetaSummary,
  ColorStrip,
  getCardAccentColors,
  getMechanicSummary,
  OwnershipDots,
  RenderOraclePreview,
  VerticalColorStrip
} from "../../cardPresentation";
import type { CardSummary, Mechanic } from "../../types";
import { SharedFilters } from "../shared/SharedFilters";
import {
  VISIBLE_RESULTS_STEP,
  defaultSearch,
  type FilterState,
  type FilterStateUpdater,
  type MechanicSection,
  type ResultsViewMode
} from "../shared/filterState";

type TableSortKey =
  | "name"
  | "colors"
  | "manaValue"
  | "manaCost"
  | "typeLine"
  | "ownedCount"
  | "rawOwnedCount"
  | "set"
  | "rarity"
  | "mechanics";

type SearchScreenProps = {
  filtersCollapsed: boolean;
  onCollapseFilters: () => void;
  onExpandFilters: () => void;
  onOpenDeckDrawer: () => void;
  selectedDeckLabel: string;
  activeDeckTotalCards: number;
  searchState: FilterState;
  updateSearchFilters: FilterStateUpdater;
  selectedSearchMechanics: Mechanic[];
  sidebarFavorites: Mechanic[];
  sidebarDerivedGroups: MechanicSection[];
  sidebarMechanicSelection: string[];
  onToggleMechanic: (slug: string) => void;
  onOpenGlossary: () => void;
  cards: CardSummary[];
  cardsTotal: number;
  searchLoading: boolean;
  visibleResultsCount: number;
  onVisibleResultsCountChange: (updater: (current: number) => number) => void;
  viewMode: ResultsViewMode;
  onViewModeChange: (mode: ResultsViewMode) => void;
  visibleCards: CardSummary[];
  visibleSortedCards: CardSummary[];
  onClearDrilldown: () => void;
  onToggleTableSort: (key: TableSortKey) => void;
  onOpenCardDetail: (card: CardSummary) => void;
  renderActions: (card: CardSummary) => ReactNode;
};

export function SearchScreen({
  filtersCollapsed,
  onCollapseFilters,
  onExpandFilters,
  onOpenDeckDrawer,
  selectedDeckLabel,
  activeDeckTotalCards,
  searchState,
  updateSearchFilters,
  selectedSearchMechanics,
  sidebarFavorites,
  sidebarDerivedGroups,
  sidebarMechanicSelection,
  onToggleMechanic,
  onOpenGlossary,
  cards,
  cardsTotal,
  searchLoading,
  visibleResultsCount,
  onVisibleResultsCountChange,
  viewMode,
  onViewModeChange,
  visibleCards,
  visibleSortedCards,
  onClearDrilldown,
  onToggleTableSort,
  onOpenCardDetail,
  renderActions
}: SearchScreenProps) {
  return (
    <div className={filtersCollapsed ? "search-layout filters-collapsed" : "search-layout"}>
      {!filtersCollapsed ? (
        <aside className="search-sidebar">
          <section className="panel filters-panel">
            <div className="panel-header filters-panel-header">
              <button className="ghost-button subtle-button cart-button header-cart-button" onClick={onOpenDeckDrawer} type="button">
                <span className="deck-cart-icon" aria-hidden="true">
                  <span />
                  <span />
                </span>
                <span className="cart-button-label">{selectedDeckLabel}</span>
                <span className="cart-badge">{activeDeckTotalCards}</span>
              </button>
              <div className="panel-actions">
                <button aria-label="Collapse filters" className="ghost-button subtle-button icon-button" onClick={onCollapseFilters} type="button">
                  ←
                </button>
              </div>
            </div>
            <SharedFilters
              state={searchState}
              updateState={updateSearchFilters}
              ownedLabel="Owned cards only"
              ownedHintOn="Showing only your imported collection"
              ownedHintOff="Showing the full Arena catalog"
              onClear={() => updateSearchFilters(() => defaultSearch)}
              selectedMechanics={selectedSearchMechanics}
              sidebarFavorites={sidebarFavorites}
              sidebarDerivedGroups={sidebarDerivedGroups}
              sidebarMechanicSelection={sidebarMechanicSelection}
              onToggleMechanic={onToggleMechanic}
              onOpenGlossary={onOpenGlossary}
            />
          </section>
        </aside>
      ) : (
        <button aria-label="Expand filters" className="ghost-button subtle-button search-expand-fab" onClick={onExpandFilters} type="button">
          →
        </button>
      )}

      <section className="panel results-panel">
        <div className="panel-header">
          <div className="results-header-main">
            <h2>Search Results</h2>
            <span>
              {searchLoading ? "Searching..." : `Showing ${Math.min(visibleResultsCount, cards.length)} of ${cardsTotal} matches`}
            </span>
          </div>
          <div className="view-toggle">
            {(["grid", "list", "table"] as ResultsViewMode[]).map((mode) => (
              <button className={viewMode === mode ? "view-button active" : "view-button"} key={mode} onClick={() => onViewModeChange(mode)} type="button">
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {searchState.drilldownKind && searchState.drilldownLabel ? (
          <div className="stats-drilldown-banner">
            <div>
              <strong>Metric filter active</strong>
              <span>Showing cards from the current filter set plus {searchState.drilldownLabel}.</span>
            </div>
            <button className="ghost-button subtle-button" onClick={onClearDrilldown} type="button">
              Clear metric filter
            </button>
          </div>
        ) : null}

        {viewMode === "grid" ? (
          <div className="results-grid">
            {visibleCards.map((card) => (
              <article className="card-tile" key={card.id}>
                <ColorStrip colors={getCardAccentColors(card)} />
                <div className="card-tile-body">
                  <div className="card-tile-header">
                    <div>
                      <h3>{card.name}</h3>
                      <p>{card.typeLine}</p>
                    </div>
                    <div className="card-corner">
                      <CardCornerVisual card={card} />
                      <OwnershipDots card={card} />
                    </div>
                  </div>
                  <p className="rules-text">
                    <RenderOraclePreview text={card.oracleText} />
                  </p>
                  <div className="tag-row">
                    {card.mechanics.slice(0, 6).map((mechanic) => (
                      <span className={`tag ${mechanic.type}`} key={mechanic.slug} title={mechanic.definition}>
                        {mechanic.label}
                      </span>
                    ))}
                  </div>
                  <div className="card-meta">
                    <CardMetaSummary card={card} />
                  </div>
                  <div className="card-actions">{renderActions(card)}</div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {viewMode === "list" ? (
          <div className="results-list">
            {visibleCards.map((card) => (
              <article className="result-row" key={card.id}>
                <ColorStrip colors={getCardAccentColors(card)} />
                <div className="result-row-body">
                  <div className="result-row-main">
                    <div className="result-row-title">
                      <strong>{card.name}</strong>
                      <span>{card.typeLine}</span>
                    </div>
                    <div className="result-row-oracle">
                      <RenderOraclePreview className="oracle-preview" text={card.oracleText} />
                    </div>
                    <div className="result-row-footer">
                      <div className="card-meta">
                        <CardMetaSummary card={card} />
                      </div>
                      <div className="list-mechanics">{getMechanicSummary(card, 4) || "No indexed mechanics"}</div>
                    </div>
                  </div>
                  <div className="result-row-side">
                    <CardCornerVisual card={card} compactLand />
                    <OwnershipDots card={card} />
                    <div className="card-actions compact-actions">{renderActions(card)}</div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {viewMode === "table" ? (
          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>
                    <button className="table-sort" onClick={() => onToggleTableSort("name")} type="button">
                      Name
                    </button>
                  </th>
                  <th>
                    <button className="table-sort table-sort-center" onClick={() => onToggleTableSort("manaCost")} type="button">
                      Cost
                    </button>
                  </th>
                  <th>
                    <button className="table-sort table-sort-center" onClick={() => onToggleTableSort("manaValue")} type="button">
                      MV
                    </button>
                  </th>
                  <th>
                    <button className="table-sort" onClick={() => onToggleTableSort("typeLine")} type="button">
                      Type
                    </button>
                  </th>
                  <th>
                    <button className="table-sort table-sort-center" onClick={() => onToggleTableSort("ownedCount")} type="button">
                      Playable
                    </button>
                  </th>
                  <th>
                    <button className="table-sort table-sort-center" onClick={() => onToggleTableSort("rawOwnedCount")} type="button">
                      Raw
                    </button>
                  </th>
                  <th>
                    <button className="table-sort" onClick={() => onToggleTableSort("set")} type="button">
                      Set
                    </button>
                  </th>
                  <th>
                    <button className="table-sort" onClick={() => onToggleTableSort("rarity")} type="button">
                      Rarity
                    </button>
                  </th>
                  <th>
                    <button className="table-sort" onClick={() => onToggleTableSort("mechanics")} type="button">
                      Mechanics
                    </button>
                  </th>
                  <th className="table-head-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleSortedCards.map((card) => (
                  <tr key={`table-${card.id}`}>
                    <td>
                      <button className="table-card-trigger table-name table-name-accent" onClick={() => onOpenCardDetail(card)} type="button">
                        <VerticalColorStrip colors={getCardAccentColors(card)} />
                        <strong>{card.name}</strong>
                        <span>{card.typeLine}</span>
                      </button>
                    </td>
                    <td className="table-cell-center table-cell-graphic">
                      <CardCornerVisual card={card} compactLand />
                    </td>
                    <td className="table-cell-center">{card.manaValue}</td>
                    <td>{card.typeLine}</td>
                    <td className="table-cell-center">{card.deckBuildingLimit === null ? "∞" : card.ownedCount}</td>
                    <td className="table-cell-center">{card.rawOwnedCount}</td>
                    <td>{card.preferredSetCode ?? "SET"}</td>
                    <td>{card.rarity}</td>
                    <td>{getMechanicSummary(card, 3) || "None"}</td>
                    <td className="table-cell-center table-cell-actions">
                      <div className="card-actions table-actions">{renderActions(card)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {!searchLoading && cards.length > 0 ? (
          <div className="results-footer">
            <span className="results-summary">
              Loaded {cards.length.toLocaleString()} result{cards.length === 1 ? "" : "s"}
              {cardsTotal > cards.length ? ` of ${cardsTotal.toLocaleString()} total` : ""}
            </span>
            <div className="results-actions">
              {visibleResultsCount < cards.length ? (
                <button
                  className="ghost-button subtle-button"
                  onClick={() => onVisibleResultsCountChange((current) => Math.min(current + VISIBLE_RESULTS_STEP, cards.length))}
                  type="button"
                >
                  Show {Math.min(VISIBLE_RESULTS_STEP, cards.length - visibleResultsCount)} more
                </button>
              ) : null}
              {visibleResultsCount < cards.length ? (
                <button className="ghost-button subtle-button" onClick={() => onVisibleResultsCountChange(() => cards.length)} type="button">
                  Show all loaded
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
