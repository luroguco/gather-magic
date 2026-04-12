import type { StatsBreakdownItem } from "../../types";
import type { StatsDrilldownKind } from "../shared/filterState";
type StatsBreakdownSectionProps = {
    title: string;
    items: StatsBreakdownItem[];
    drilldownKind: StatsDrilldownKind;
    ownedOnly: boolean;
    emptyMessage: string;
    onViewCards: (drilldownKind: StatsDrilldownKind, item: StatsBreakdownItem) => void;
};
export declare function StatsBreakdownSection({ title, items, drilldownKind, ownedOnly, emptyMessage, onViewCards }: StatsBreakdownSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
