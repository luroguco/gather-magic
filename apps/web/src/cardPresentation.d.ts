import type { CardSummary } from "./types";
type ManaToken = {
    kind: "generic" | "simple" | "other";
    key: string;
    count: number;
    label: string;
    colors: string[];
} | {
    kind: "hybrid";
    key: string;
    count: number;
    label: string;
    colors: [string, string];
};
export declare const isLandCard: (card: CardSummary) => boolean;
export declare const getCardAccentColors: (card: CardSummary) => string[];
export declare const getLandIndicatorColors: (card: CardSummary, compact?: boolean) => {
    colors: string[];
    overflowCount: number;
};
export declare const getMechanicSummary: (card: CardSummary, limit?: number) => string;
export declare const parseGroupedManaCost: (manaCost: string | null) => ManaToken[];
export declare const renderManaToken: (token: ManaToken, dense?: boolean) => import("react/jsx-runtime").JSX.Element;
export declare const renderOracleText: (oracleText: string) => import("react/jsx-runtime").JSX.Element[];
export declare const ColorStrip: ({ colors }: {
    colors: string[];
}) => import("react/jsx-runtime").JSX.Element;
export declare const VerticalColorStrip: ({ colors }: {
    colors: string[];
}) => import("react/jsx-runtime").JSX.Element;
export declare const OwnershipDots: ({ card }: {
    card: CardSummary;
}) => import("react/jsx-runtime").JSX.Element;
export declare const CardCornerVisual: ({ card, compactLand }: {
    card: CardSummary;
    compactLand?: boolean;
}) => import("react/jsx-runtime").JSX.Element;
export declare const CardMetaSummary: ({ card }: {
    card: CardSummary;
}) => import("react/jsx-runtime").JSX.Element;
export declare const CompactColorCell: ({ card }: {
    card: CardSummary;
}) => import("react/jsx-runtime").JSX.Element;
export declare const RenderOraclePreview: ({ text, className }: {
    text: string;
    className?: string;
}) => import("react/jsx-runtime").JSX.Element;
export declare const trailingActionButtons: (card: CardSummary, showCommander: boolean, onAdd: (card: CardSummary, section: "main" | "sideboard" | "commander") => void) => import("react/jsx-runtime").JSX.Element;
export {};
