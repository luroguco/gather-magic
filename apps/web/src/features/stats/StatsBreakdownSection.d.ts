import type { StatsBreakdownItem, StatsBreakdownTreeNode } from "../../types";
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
type StatsTreeBreakdownSectionProps = {
    title: string;
    items: StatsBreakdownTreeNode[];
    ownedOnly: boolean;
    emptyMessage: string;
    onViewCards: (drilldownKind: StatsDrilldownKind, item: StatsBreakdownItem) => void;
};
export declare function StatsTreeBreakdownSection({ title, items, ownedOnly, emptyMessage, onViewCards }: StatsTreeBreakdownSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
