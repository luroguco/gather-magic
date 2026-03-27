import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
const CARD_COLOR_ORDER = ["W", "U", "B", "R", "G"];
const MANA_COLOR_CLASS = {
    W: "white",
    U: "blue",
    B: "black",
    R: "red",
    G: "green",
    C: "colorless"
};
const normalizeSymbol = (symbol) => symbol.toUpperCase().trim();
const classifyManaSymbol = (symbol) => {
    const normalized = normalizeSymbol(symbol);
    if (/^\d+$/.test(normalized)) {
        return {
            kind: "generic",
            key: normalized,
            count: Number.parseInt(normalized, 10),
            label: normalized,
            colors: ["C"]
        };
    }
    if (/^[WUBRGC]$/.test(normalized)) {
        return {
            kind: "simple",
            key: normalized,
            count: 1,
            label: "1",
            colors: [normalized]
        };
    }
    if (/^[WUBRGC]\/[WUBRGC]$/.test(normalized)) {
        const [left, right] = normalized.split("/");
        return {
            kind: "hybrid",
            key: normalized,
            count: 1,
            label: "1",
            colors: [left, right]
        };
    }
    return {
        kind: "other",
        key: normalized,
        count: 1,
        label: normalized,
        colors: ["C"]
    };
};
export const isLandCard = (card) => card.typeLine.toLowerCase().includes("land");
export const getCardAccentColors = (card) => {
    const source = card.colorIdentity.length ? card.colorIdentity : card.colors;
    const normalized = source.filter((color) => CARD_COLOR_ORDER.includes(color));
    return normalized.length ? normalized : ["C"];
};
export const getLandIndicatorColors = (card, compact = false) => {
    const colors = getCardAccentColors(card);
    if (!compact || colors.length <= 3) {
        return {
            colors,
            overflowCount: 0
        };
    }
    return {
        colors: colors.slice(0, 3),
        overflowCount: colors.length - 3
    };
};
const getLandIndicators = (card, compact = false) => {
    const { colors, overflowCount } = getLandIndicatorColors(card, compact);
    if (colors.length === 2) {
        const left = colors[0] ?? "C";
        const right = colors[1] ?? "C";
        return {
            indicators: [
                {
                    kind: "hybrid",
                    colors: [left, right],
                    key: `${card.id}-land-${left}-${right}`
                }
            ],
            overflowCount
        };
    }
    return {
        indicators: colors.map((color, index) => ({
            kind: "simple",
            colors: [color],
            key: `${card.id}-land-${color}-${index}`
        })),
        overflowCount
    };
};
export const getMechanicSummary = (card, limit = 3) => card.mechanics
    .slice(0, limit)
    .map((mechanic) => mechanic.label)
    .join(", ");
export const parseGroupedManaCost = (manaCost) => {
    if (!manaCost) {
        return [];
    }
    const symbols = [...manaCost.matchAll(/\{([^}]+)\}/g)]
        .map((match) => match[1])
        .filter((value) => Boolean(value));
    const grouped = new Map();
    const order = [];
    for (const symbol of symbols) {
        const token = classifyManaSymbol(symbol);
        if (token.kind === "generic" || token.kind === "simple" || token.kind === "hybrid") {
            const existing = grouped.get(token.key);
            if (existing) {
                existing.count += token.kind === "generic" ? token.count : 1;
                existing.label = String(existing.count);
            }
            else {
                grouped.set(token.key, token);
                order.push(token.key);
            }
            continue;
        }
        const uniqueKey = `${token.key}-${order.length}`;
        grouped.set(uniqueKey, token);
        order.push(uniqueKey);
    }
    return order
        .map((key) => grouped.get(key))
        .filter((token) => Boolean(token))
        .map((token) => token.kind === "generic"
        ? { ...token, label: String(token.count) }
        : token.kind === "simple" || token.kind === "hybrid"
            ? { ...token, label: String(token.count) }
            : token);
};
export const renderManaToken = (token, dense = false) => {
    const baseClass = dense ? "mana-token dense" : "mana-token";
    if (token.kind === "hybrid") {
        const [left, right] = token.colors;
        return (_jsxs("span", { className: `${baseClass} hybrid`, title: token.key, children: [_jsx("span", { className: `mana-half ${MANA_COLOR_CLASS[left] ?? "colorless"}` }), _jsx("span", { className: `mana-half ${MANA_COLOR_CLASS[right] ?? "colorless"}` }), _jsx("span", { className: "mana-token-label", children: token.label })] }, token.key));
    }
    const primaryColor = token.colors[0] ?? "C";
    const colorClass = MANA_COLOR_CLASS[primaryColor] ?? "generic";
    return (_jsx("span", { className: `${baseClass} ${colorClass}`, title: token.key, children: _jsx("span", { className: "mana-token-label", children: token.label }) }, token.key));
};
export const renderOracleText = (oracleText) => {
    const lines = oracleText.split("\n");
    return lines.map((line, lineIndex) => {
        const parts = line.split(/(\{[^}]+\})/g).filter(Boolean);
        return (_jsxs("span", { children: [parts.map((part, partIndex) => {
                    const match = part.match(/^\{([^}]+)\}$/);
                    if (!match?.[1]) {
                        return _jsx("span", { children: part }, `text-${lineIndex}-${partIndex}`);
                    }
                    const symbol = normalizeSymbol(match[1]);
                    if (symbol === "T" || symbol === "Q") {
                        return (_jsx("span", { className: `oracle-symbol ${symbol === "T" ? "tap" : "untap"}`, children: symbol }, `symbol-${lineIndex}-${partIndex}`));
                    }
                    const token = classifyManaSymbol(symbol);
                    return (_jsx("span", { className: "oracle-mana", children: renderManaToken(token, true) }, `mana-${lineIndex}-${partIndex}`));
                }), lineIndex < lines.length - 1 ? _jsx("br", {}) : null] }, `oracle-line-${lineIndex}`));
    });
};
export const ColorStrip = ({ colors }) => (_jsx("div", { className: "color-strip", "aria-hidden": "true", children: colors.map((color, index) => (_jsx("span", { className: `color-segment ${MANA_COLOR_CLASS[color] ?? "colorless"}` }, `${color}-${index}`))) }));
export const VerticalColorStrip = ({ colors }) => (_jsx("div", { className: "vertical-color-strip", "aria-hidden": "true", children: colors.map((color, index) => (_jsx("span", { className: `vertical-color-segment ${MANA_COLOR_CLASS[color] ?? "colorless"}` }, `${color}-${index}`))) }));
export const OwnershipDots = ({ card }) => (_jsx("div", { className: "ownership-dots", title: card.rawOwnedCount <= 0 ? "0 owned" : `${card.ownedCount} playable · ${card.rawOwnedCount} owned`, children: card.deckBuildingLimit === null ? (_jsx("span", { className: "ownership-infinity", children: "\u221E" })) : (Array.from({ length: 4 }, (_, index) => (_jsx("span", { className: index < card.ownedCount ? "ownership-dot filled" : "ownership-dot" }, `${card.id}-owned-${index}`)))) }));
export const CardCornerVisual = ({ card, compactLand = false }) => {
    if (!card.manaCost && isLandCard(card)) {
        const { indicators, overflowCount } = getLandIndicators(card, compactLand);
        return (_jsxs("div", { className: "land-indicators", children: [indicators.map((indicator) => {
                    if (indicator.kind === "hybrid") {
                        const [left, right] = indicator.colors;
                        return (_jsxs("span", { className: "land-indicator hybrid", children: [_jsx("span", { className: `land-indicator-half ${MANA_COLOR_CLASS[left] ?? "colorless"}` }), _jsx("span", { className: `land-indicator-half ${MANA_COLOR_CLASS[right] ?? "colorless"}` })] }, indicator.key));
                    }
                    const [color] = indicator.colors;
                    return (_jsx("span", { className: `land-indicator ${MANA_COLOR_CLASS[color] ?? "colorless"}` }, indicator.key));
                }), overflowCount > 0 ? _jsxs("span", { className: "land-indicator overflow", children: ["+", overflowCount] }) : null] }));
    }
    const tokens = parseGroupedManaCost(card.manaCost);
    return _jsx("div", { className: "mana-token-row", children: tokens.map((token) => renderManaToken(token)) });
};
export const CardMetaSummary = ({ card }) => (_jsxs(_Fragment, { children: [_jsx("span", { children: card.preferredSetCode ?? "SET" }), _jsx("span", { children: card.rarity }), _jsxs("span", { children: ["MV ", card.manaValue] })] }));
export const CompactColorCell = ({ card }) => {
    const colors = getCardAccentColors(card);
    return (_jsx("span", { className: "table-colors", title: colors.join("/"), children: colors.map((color, index) => (_jsx("span", { className: `table-color ${MANA_COLOR_CLASS[color] ?? "colorless"}` }, `${card.id}-table-${color}-${index}`))) }));
};
export const RenderOraclePreview = ({ text, className }) => _jsx("span", { className: className, children: renderOracleText(text || "No oracle text available.") });
export const trailingActionButtons = (card, showCommander, onAdd) => (_jsxs(_Fragment, { children: [_jsx("button", { className: "subtle-add", onClick: () => onAdd(card, "main"), type: "button", children: "+Main" }), _jsx("button", { className: "subtle-add", onClick: () => onAdd(card, "sideboard"), type: "button", children: "+Side" }), showCommander ? (_jsx("button", { className: "subtle-add", onClick: () => onAdd(card, "commander"), type: "button", children: "+Cmdr" })) : null] }));
