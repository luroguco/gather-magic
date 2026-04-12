import type { StatsBreakdownItem } from "../../types";
import type { StatsDrilldownKind } from "../shared/filterState";

const getPrimaryBreakdownValue = (item: StatsBreakdownItem, ownedOnly: boolean) =>
  ownedOnly ? item.playableOwnedCopies : item.titleCount;

const formatBreakdownMetricLabel = (ownedOnly: boolean) => (ownedOnly ? "playable copies" : "titles");

type StatsBreakdownSectionProps = {
  title: string;
  items: StatsBreakdownItem[];
  drilldownKind: StatsDrilldownKind;
  ownedOnly: boolean;
  emptyMessage: string;
  onViewCards: (drilldownKind: StatsDrilldownKind, item: StatsBreakdownItem) => void;
};

export function StatsBreakdownSection({
  title,
  items,
  drilldownKind,
  ownedOnly,
  emptyMessage,
  onViewCards
}: StatsBreakdownSectionProps) {
  const maxValue = Math.max(...items.map((entry) => getPrimaryBreakdownValue(entry, ownedOnly)), 1);

  return (
    <section className="panel stats-section">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <span>Primary metric: {formatBreakdownMetricLabel(ownedOnly)}</span>
        </div>
        <span>{items.length} rows</span>
      </div>
      {items.length ? (
        <div className="stats-breakdown-list">
          {items.map((item) => {
            const primaryValue = getPrimaryBreakdownValue(item, ownedOnly);
            const width = `${Math.max((primaryValue / maxValue) * 100, primaryValue > 0 ? 4 : 0)}%`;
            return (
              <article className="stats-breakdown-row" key={`${title}-${item.key}`}>
                <div className="stats-breakdown-copy">
                  <strong>{item.label}</strong>
                  <span>
                    {item.titleCount} titles · {item.playableOwnedCopies} playable · {item.rawOwnedCopies} raw
                  </span>
                </div>
                <div className="stats-breakdown-bar-shell" aria-hidden="true">
                  <div className="stats-breakdown-bar" style={{ width }} />
                </div>
                <div className="stats-breakdown-actions">
                  <strong className="stats-breakdown-value">{primaryValue.toLocaleString()}</strong>
                  <button className="ghost-button subtle-button" onClick={() => onViewCards(drilldownKind, item)} type="button">
                    View cards
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="stats-empty-message">{emptyMessage}</div>
      )}
    </section>
  );
}
