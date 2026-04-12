import type { CardStatsResponse, Mechanic } from "../../types";
import { SharedFilters } from "../shared/SharedFilters";
import {
  defaultStatsFilters,
  type FilterState,
  type FilterStateUpdater,
  type MechanicSection
} from "../shared/filterState";
import { StatsBreakdownSection } from "./StatsBreakdownSection";

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

export function StatsScreen({
  statsState,
  updateStatsFilters,
  selectedStatsMechanics,
  sidebarFavorites,
  sidebarDerivedGroups,
  sidebarMechanicSelection,
  onToggleMechanic,
  onOpenGlossary,
  cardStats,
  statsLoading,
  onOpenStatsSearchView,
  onOpenStatsDrilldown
}: StatsScreenProps) {
  const statsSummaryCards = cardStats
    ? [
        { label: "Matching titles", value: cardStats.summary.matchingTitles },
        { label: "Playable owned copies", value: cardStats.summary.playableOwnedCopies },
        { label: "Raw owned copies", value: cardStats.summary.rawOwnedCopies },
        { label: "Average mana value", value: cardStats.summary.averageManaValue },
        { label: "Sets represented", value: cardStats.summary.setsRepresented },
        { label: "Mechanics represented", value: cardStats.summary.mechanicsRepresented }
      ]
    : [];

  return (
    <div className="search-layout stats-layout">
      <aside className="search-sidebar">
        <section className="panel filters-panel">
          <div className="panel-header filters-panel-header">
            <div>
              <h2>Stats Filters</h2>
              <span>Reuse the same card filters, then aggregate over the matching set.</span>
            </div>
          </div>
          <SharedFilters
            state={statsState}
            updateState={updateStatsFilters}
            ownedLabel={statsState.ownedOnly ? "Owned collection" : "Full catalog"}
            ownedHintOn="Playable copies drive the dashboard totals"
            ownedHintOff="Counts include unowned Arena cards that match the filters"
            onClear={() => updateStatsFilters(() => defaultStatsFilters)}
            selectedMechanics={selectedStatsMechanics}
            sidebarFavorites={sidebarFavorites}
            sidebarDerivedGroups={sidebarDerivedGroups}
            sidebarMechanicSelection={sidebarMechanicSelection}
            onToggleMechanic={onToggleMechanic}
            onOpenGlossary={onOpenGlossary}
          />
        </section>
      </aside>

      <section className="stats-dashboard">
        <section className="panel stats-hero-panel">
          <div className="panel-header">
            <div>
              <h2>{statsState.ownedOnly ? "Owned collection stats" : "Full catalog stats"}</h2>
              <span>
                {statsLoading ? "Calculating stats..." : "Dashboard metrics are computed directly from the filtered catalog."}
              </span>
            </div>
          </div>

          {statsLoading ? (
            <div className="stats-empty-message">Calculating stats...</div>
          ) : !cardStats || cardStats.summary.matchingTitles === 0 ? (
            <div className="stats-empty-message">No cards match the current filters.</div>
          ) : (
            <>
              <div className="snapshot-grid stats-summary-grid">
                {statsSummaryCards.map((card) => (
                  <div className="stat-card summary-drilldown-card" key={card.label}>
                    <span>{card.label}</span>
                    <strong>{card.value.toLocaleString()}</strong>
                    <button className="ghost-button subtle-button summary-drilldown-button" onClick={onOpenStatsSearchView} type="button">
                      View cards
                    </button>
                  </div>
                ))}
              </div>

              <div className="stats-breakdown-grid">
                <StatsBreakdownSection title="Color Breakdown" items={cardStats.breakdowns.colors} drilldownKind="color" ownedOnly={statsState.ownedOnly} emptyMessage="No colors in the current result set." onViewCards={onOpenStatsDrilldown} />
                <StatsBreakdownSection title="Mana Value Breakdown" items={cardStats.breakdowns.manaValues} drilldownKind="manaValue" ownedOnly={statsState.ownedOnly} emptyMessage="No mana values available." onViewCards={onOpenStatsDrilldown} />
                <StatsBreakdownSection title="Type Breakdown" items={cardStats.breakdowns.types} drilldownKind="type" ownedOnly={statsState.ownedOnly} emptyMessage="No types in the current result set." onViewCards={onOpenStatsDrilldown} />
                <StatsBreakdownSection title="Rarity Breakdown" items={cardStats.breakdowns.rarities} drilldownKind="rarity" ownedOnly={statsState.ownedOnly} emptyMessage="No rarity data available." onViewCards={onOpenStatsDrilldown} />
              </div>

              <div className="stats-breakdown-stack">
                <StatsBreakdownSection title="Set Breakdown" items={cardStats.breakdowns.sets} drilldownKind="set" ownedOnly={statsState.ownedOnly} emptyMessage="No sets in the current result set." onViewCards={onOpenStatsDrilldown} />
                <StatsBreakdownSection title="Mechanic Breakdown" items={cardStats.breakdowns.mechanics} drilldownKind="mechanic" ownedOnly={statsState.ownedOnly} emptyMessage="No mechanics in the current result set." onViewCards={onOpenStatsDrilldown} />
              </div>
            </>
          )}
        </section>
      </section>
    </div>
  );
}
