import type { CardSummary } from "./types";

type ManaToken =
  | {
      kind: "generic" | "simple" | "other";
      key: string;
      count: number;
      label: string;
      colors: string[];
    }
  | {
      kind: "hybrid";
      key: string;
      count: number;
      label: string;
      colors: [string, string];
    };

const CARD_COLOR_ORDER = ["W", "U", "B", "R", "G"] as const;

const MANA_COLOR_CLASS: Record<string, string> = {
  W: "white",
  U: "blue",
  B: "black",
  R: "red",
  G: "green",
  C: "colorless"
};

const normalizeSymbol = (symbol: string) => symbol.toUpperCase().trim();

const classifyManaSymbol = (symbol: string): ManaToken => {
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
    const [left, right] = normalized.split("/") as [string, string];
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

export const isLandCard = (card: CardSummary) => card.typeLine.toLowerCase().includes("land");

export const getCardAccentColors = (card: CardSummary) => {
  const source = card.colorIdentity.length ? card.colorIdentity : card.colors;
  const normalized = source.filter((color) => CARD_COLOR_ORDER.includes(color as (typeof CARD_COLOR_ORDER)[number]));
  return normalized.length ? normalized : ["C"];
};

export const getLandIndicatorColors = (card: CardSummary, compact = false) => {
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

type LandIndicator =
  | {
      kind: "simple";
      colors: [string];
      key: string;
    }
  | {
      kind: "hybrid";
      colors: [string, string];
      key: string;
    };

const getLandIndicators = (card: CardSummary, compact = false) => {
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
        } satisfies LandIndicator
      ],
      overflowCount
    };
  }

  return {
    indicators: colors.map(
      (color, index) =>
        ({
          kind: "simple",
          colors: [color],
          key: `${card.id}-land-${color}-${index}`
        }) satisfies LandIndicator
    ),
    overflowCount
  };
};

export const getMechanicSummary = (card: CardSummary, limit = 3) =>
  card.mechanics
    .slice(0, limit)
    .map((mechanic) => mechanic.label)
    .join(", ");

export const parseGroupedManaCost = (manaCost: string | null): ManaToken[] => {
  if (!manaCost) {
    return [];
  }

  const symbols = [...manaCost.matchAll(/\{([^}]+)\}/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));

  const grouped = new Map<string, ManaToken>();
  const order: string[] = [];

  for (const symbol of symbols) {
    const token = classifyManaSymbol(symbol);
    if (token.kind === "generic" || token.kind === "simple" || token.kind === "hybrid") {
      const existing = grouped.get(token.key);
      if (existing) {
        existing.count += token.kind === "generic" ? token.count : 1;
        existing.label = String(existing.count);
      } else {
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
    .filter((token): token is ManaToken => Boolean(token))
    .map((token) =>
      token.kind === "generic"
        ? { ...token, label: String(token.count) }
        : token.kind === "simple" || token.kind === "hybrid"
          ? { ...token, label: String(token.count) }
          : token
    );
};

export const renderManaToken = (token: ManaToken, dense = false) => {
  const baseClass = dense ? "mana-token dense" : "mana-token";
  if (token.kind === "hybrid") {
    const [left, right] = token.colors;
    return (
      <span
        className={`${baseClass} hybrid`}
        key={token.key}
        title={token.key}
      >
        <span className={`mana-half ${MANA_COLOR_CLASS[left] ?? "colorless"}`} />
        <span className={`mana-half ${MANA_COLOR_CLASS[right] ?? "colorless"}`} />
        <span className="mana-token-label">{token.label}</span>
      </span>
    );
  }

  const primaryColor = token.colors[0] ?? "C";
  const colorClass = MANA_COLOR_CLASS[primaryColor] ?? "generic";
  return (
    <span className={`${baseClass} ${colorClass}`} key={token.key} title={token.key}>
      <span className="mana-token-label">{token.label}</span>
    </span>
  );
};

export const renderOracleText = (oracleText: string) => {
  const lines = oracleText.split("\n");
  return lines.map((line, lineIndex) => {
    const parts = line.split(/(\{[^}]+\})/g).filter(Boolean);
    return (
      <span key={`oracle-line-${lineIndex}`}>
        {parts.map((part, partIndex) => {
          const match = part.match(/^\{([^}]+)\}$/);
          if (!match?.[1]) {
            return <span key={`text-${lineIndex}-${partIndex}`}>{part}</span>;
          }

          const symbol = normalizeSymbol(match[1]);
          if (symbol === "T" || symbol === "Q") {
            return (
              <span className={`oracle-symbol ${symbol === "T" ? "tap" : "untap"}`} key={`symbol-${lineIndex}-${partIndex}`}>
                {symbol}
              </span>
            );
          }

          const token = classifyManaSymbol(symbol);
          return (
            <span className="oracle-mana" key={`mana-${lineIndex}-${partIndex}`}>
              {renderManaToken(token, true)}
            </span>
          );
        })}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    );
  });
};

export const ColorStrip = ({ colors }: { colors: string[] }) => (
  <div className="color-strip" aria-hidden="true">
    {colors.map((color, index) => (
      <span className={`color-segment ${MANA_COLOR_CLASS[color] ?? "colorless"}`} key={`${color}-${index}`} />
    ))}
  </div>
);

export const VerticalColorStrip = ({ colors }: { colors: string[] }) => (
  <div className="vertical-color-strip" aria-hidden="true">
    {colors.map((color, index) => (
      <span className={`vertical-color-segment ${MANA_COLOR_CLASS[color] ?? "colorless"}`} key={`${color}-${index}`} />
    ))}
  </div>
);

export const OwnershipDots = ({ card }: { card: CardSummary }) => (
  <div className="ownership-dots" title={card.rawOwnedCount <= 0 ? "0 owned" : `${card.ownedCount} playable · ${card.rawOwnedCount} owned`}>
    {card.deckBuildingLimit === null ? (
      <span className="ownership-infinity">∞</span>
    ) : (
      Array.from({ length: 4 }, (_, index) => (
        <span
          className={index < card.ownedCount ? "ownership-dot filled" : "ownership-dot"}
          key={`${card.id}-owned-${index}`}
        />
      ))
    )}
  </div>
);

export const CardCornerVisual = ({
  card,
  compactLand = false
}: {
  card: CardSummary;
  compactLand?: boolean;
}) => {
  if (!card.manaCost && isLandCard(card)) {
    const { indicators, overflowCount } = getLandIndicators(card, compactLand);
    return (
      <div className="land-indicators">
        {indicators.map((indicator) => {
          if (indicator.kind === "hybrid") {
            const [left, right] = indicator.colors;
            return (
              <span className="land-indicator hybrid" key={indicator.key}>
                <span className={`land-indicator-half ${MANA_COLOR_CLASS[left] ?? "colorless"}`} />
                <span className={`land-indicator-half ${MANA_COLOR_CLASS[right] ?? "colorless"}`} />
              </span>
            );
          }

          const [color] = indicator.colors;
          return (
            <span
              className={`land-indicator ${MANA_COLOR_CLASS[color] ?? "colorless"}`}
              key={indicator.key}
            />
          );
        })}
        {overflowCount > 0 ? <span className="land-indicator overflow">+{overflowCount}</span> : null}
      </div>
    );
  }

  const tokens = parseGroupedManaCost(card.manaCost);
  return <div className="mana-token-row">{tokens.map((token) => renderManaToken(token))}</div>;
};

export const CardMetaSummary = ({ card }: { card: CardSummary }) => (
  <>
    <span>{card.preferredSetCode ?? "SET"}</span>
    <span>{card.rarity}</span>
    <span>MV {card.manaValue}</span>
  </>
);

export const CompactColorCell = ({ card }: { card: CardSummary }) => {
  const colors = getCardAccentColors(card);
  return (
    <span className="table-colors" title={colors.join("/")}>
      {colors.map((color, index) => (
        <span className={`table-color ${MANA_COLOR_CLASS[color] ?? "colorless"}`} key={`${card.id}-table-${color}-${index}`} />
      ))}
    </span>
  );
};

export const RenderOraclePreview = ({
  text,
  className
}: {
  text: string;
  className?: string;
}) => <span className={className}>{renderOracleText(text || "No oracle text available.")}</span>;

export const trailingActionButtons = (
  card: CardSummary,
  showCommander: boolean,
  onAdd: (card: CardSummary, section: "main" | "sideboard" | "commander") => void
) => (
  <>
    <button className="subtle-add" onClick={() => onAdd(card, "main")} type="button">
      +Main
    </button>
    <button className="subtle-add" onClick={() => onAdd(card, "sideboard")} type="button">
      +Side
    </button>
    {showCommander ? (
      <button className="subtle-add" onClick={() => onAdd(card, "commander")} type="button">
        +Cmdr
      </button>
    ) : null}
  </>
);
