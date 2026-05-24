import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const getPrimaryBreakdownValue = (item, ownedOnly) => ownedOnly ? item.playableOwnedCopies : item.titleCount;
const formatBreakdownMetricLabel = (ownedOnly) => (ownedOnly ? "playable copies" : "titles");
export function StatsBreakdownSection({ title, items, drilldownKind, ownedOnly, emptyMessage, onViewCards }) {
    const maxValue = Math.max(...items.map((entry) => getPrimaryBreakdownValue(entry, ownedOnly)), 1);
    return (_jsxs("section", { className: "panel stats-section", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h3", { children: title }), _jsxs("span", { children: ["Primary metric: ", formatBreakdownMetricLabel(ownedOnly)] })] }), _jsxs("span", { children: [items.length, " rows"] })] }), items.length ? (_jsx("div", { className: "stats-breakdown-list", children: items.map((item) => {
                    const primaryValue = getPrimaryBreakdownValue(item, ownedOnly);
                    const width = `${Math.max((primaryValue / maxValue) * 100, primaryValue > 0 ? 4 : 0)}%`;
                    return (_jsxs("article", { className: "stats-breakdown-row", children: [_jsxs("div", { className: "stats-breakdown-copy", children: [_jsx("strong", { children: item.label }), _jsxs("span", { children: [item.titleCount, " titles \u00B7 ", item.playableOwnedCopies, " playable \u00B7 ", item.rawOwnedCopies, " raw"] })] }), _jsx("div", { className: "stats-breakdown-bar-shell", "aria-hidden": "true", children: _jsx("div", { className: "stats-breakdown-bar", style: { width } }) }), _jsxs("div", { className: "stats-breakdown-actions", children: [_jsx("strong", { className: "stats-breakdown-value", children: primaryValue.toLocaleString() }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => onViewCards(drilldownKind, item), type: "button", children: "View cards" })] })] }, `${title}-${item.key}`));
                }) })) : (_jsx("div", { className: "stats-empty-message", children: emptyMessage }))] }));
}
const getTreeDrilldownKind = (kind) => {
    if (kind === "type") {
        return "type";
    }
    if (kind === "tribe") {
        return "tribe";
    }
    return "subtype";
};
const collectTreeNodes = (items) => {
    const nodes = [];
    for (const item of items) {
        nodes.push(item);
        if (item.children?.length) {
            nodes.push(...collectTreeNodes(item.children));
        }
    }
    return nodes;
};
export function StatsTreeBreakdownSection({ title, items, ownedOnly, emptyMessage, onViewCards }) {
    const allNodes = collectTreeNodes(items);
    const maxValue = Math.max(...allNodes.map((entry) => getPrimaryBreakdownValue(entry, ownedOnly)), 1);
    const renderNode = (item, depth) => {
        const primaryValue = getPrimaryBreakdownValue(item, ownedOnly);
        const width = `${Math.max((primaryValue / maxValue) * 100, primaryValue > 0 ? 4 : 0)}%`;
        return (_jsxs("div", { className: "stats-tree-node", children: [_jsxs("article", { className: "stats-breakdown-row stats-tree-row", style: { paddingLeft: `${14 + depth * 18}px` }, children: [_jsxs("div", { className: "stats-breakdown-copy", children: [_jsx("strong", { children: item.label }), _jsxs("span", { children: [item.titleCount, " titles \u00B7 ", item.playableOwnedCopies, " playable \u00B7 ", item.rawOwnedCopies, " raw"] })] }), _jsx("div", { className: "stats-breakdown-bar-shell", "aria-hidden": "true", children: _jsx("div", { className: "stats-breakdown-bar", style: { width } }) }), _jsxs("div", { className: "stats-breakdown-actions", children: [_jsx("strong", { className: "stats-breakdown-value", children: primaryValue.toLocaleString() }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => onViewCards(getTreeDrilldownKind(item.kind), item), type: "button", children: "View cards" })] })] }), item.children?.length ? _jsx("div", { className: "stats-tree-children", children: item.children.map((child) => renderNode(child, depth + 1)) }) : null] }, `${item.kind}-${item.key}`));
    };
    return (_jsxs("section", { className: "panel stats-section", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h3", { children: title }), _jsx("span", { children: "Nested hierarchy by type, then subtype or tribe" })] }), _jsxs("span", { children: [allNodes.length, " rows"] })] }), items.length ? _jsx("div", { className: "stats-breakdown-list stats-tree-list", children: items.map((item) => renderNode(item, 0)) }) : _jsx("div", { className: "stats-empty-message", children: emptyMessage })] }));
}
