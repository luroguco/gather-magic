export type ArenaFormat = "standard" | "alchemy" | "explorer" | "historic" | "timeless" | "brawl" | "standardbrawl";
export type Mechanic = {
    slug: string;
    label: string;
    type: "keyword" | "derived";
    usageCount: number;
    ownedUsageCount: number;
    definition: string;
};
export type CardSummary = {
    id: string;
    name: string;
    oracleText: string;
    manaCost: string | null;
    manaValue: number;
    colors: string[];
    colorIdentity: string[];
    typeLine: string;
    rarity: string;
    preferredSetCode: string | null;
    preferredCollectorNumber: string | null;
    imageUrl: string | null;
    keywords: string[];
    legalities: Record<string, string>;
    ownedCount: number;
    rawOwnedCount: number;
    deckBuildingLimit: number | null;
    mechanics: Array<{
        slug: string;
        label: string;
        type: "keyword" | "derived";
        definition: string;
    }>;
};
export type CardPrint = {
    printId: string;
    arenaId: number | null;
    setCode: string;
    collectorNumber: string | null;
    imageUrl: string | null;
    releasedAt: string | null;
};
export type CardDetail = CardSummary & {
    prints: CardPrint[];
};
export type SearchResponse = {
    total: number;
    page: number;
    pageSize: number;
    items: CardSummary[];
};
export type StatsBreakdownItem = {
    key: string;
    label: string;
    titleCount: number;
    playableOwnedCopies: number;
    rawOwnedCopies: number;
};
export type CardStatsResponse = {
    scope: {
        ownedOnly: boolean;
        filtersApplied: {
            q?: string;
            format?: ArenaFormat;
            colors: string[];
            mechanics: string[];
            types: string[];
            subtypes: string[];
            rarity: string[];
            sets: string[];
            playableCountMin?: number;
            playableCountMax?: number;
            manaValueMin?: number;
            manaValueMax?: number;
        };
    };
    summary: {
        matchingTitles: number;
        playableOwnedCopies: number;
        rawOwnedCopies: number;
        averageManaValue: number;
        colorBucketsRepresented: number;
        setsRepresented: number;
        mechanicsRepresented: number;
    };
    breakdowns: {
        colors: StatsBreakdownItem[];
        manaValues: StatsBreakdownItem[];
        types: StatsBreakdownItem[];
        rarities: StatsBreakdownItem[];
        sets: StatsBreakdownItem[];
        mechanics: StatsBreakdownItem[];
    };
};
export type DeckCard = {
    cardId: string;
    quantity: number;
    section: "main" | "sideboard" | "commander";
    cardName?: string;
    typeLine?: string;
    manaCost?: string;
    manaValue?: number;
    ownedCount?: number;
};
export type Deck = {
    id: string;
    name: string;
    format: ArenaFormat;
    notes: string;
    createdAt: string;
    updatedAt: string;
    cards: DeckCard[];
};
export type DeckListItem = {
    id: string;
    name: string;
    format: ArenaFormat;
    notes: string;
    createdAt: string;
    updatedAt: string;
    cardRows: number;
    totalCards: number;
};
export type ValidationResult = {
    deckId: string;
    format: ArenaFormat;
    issues: string[];
    ownershipGaps: Array<{
        cardId: string;
        name: string;
        needed: number;
        owned: number;
        missing: number;
    }>;
};
export type AppStatus = {
    collection: {
        ownedEntries: number;
        uniqueNames: number;
        uniqueCanonicalCards: number;
        unresolvedEntries: number;
        importRowsWithCopies: number;
        ownedCopies: number;
        importedAt: string | null;
    };
    cards: {
        total: number;
    };
};
export type CollectorSnapshotMetadata = {
    snapshotVersion: number;
    capturedAt?: string;
    platform?: string;
    collectorVersion?: string;
    mtgaPid?: number;
    diagnostics?: {
        source?: string;
        warnings?: string[];
    };
};
export type CollectionImportSummary = {
    source: "untapped-json" | "collector-snapshot";
    importedAt?: string;
    extractedPath: string;
    catalogSource: "database" | "untapped-public";
    snapshotMetadata?: CollectorSnapshotMetadata;
    catalogMetadata?: {
        build?: string | null;
        locale?: string;
    };
    rawEntryCount: number;
    matchedGrpIds: number;
    unmatchedGrpIds: number;
    unmatchedEntries: Array<{
        grpId: number;
        quantity: number;
    }>;
    cardsMatched: number;
    ownedTitles: number;
    ownedCopies: number;
    rawOwnedCopies: number;
    unresolvedCards: Array<{
        name: string;
        titleCount: number;
        printCount: number;
        reason: string;
    }>;
    diff: {
        addedTitles: number;
        removedTitles: number;
        changedTitles: number;
        unchangedTitles: number;
    };
};
export type UntappedImportSummary = CollectionImportSummary;
export type CollectorCaptureFile = {
    path: string;
    filename: string;
    size: number;
    modifiedAt: string;
};
export type CollectorCaptureStatus = {
    available: boolean;
    snapshotPath: string;
    addonPath: string;
    addonAvailable: boolean;
    codesignAvailable: boolean;
    scriptAvailable: boolean;
    mtgaRunning: boolean;
    mtgaPid: number | null;
    latestCapture: CollectorCaptureFile | null;
};
export type CollectorCaptureImportSummary = CollectionImportSummary & {
    capture: CollectorCaptureFile;
};
export type UntappedCaptureFile = {
    path: string;
    filename: string;
    size: number;
    modifiedAt: string;
};
export type UntappedCaptureStatus = {
    available: boolean;
    configPath: string;
    downloadsPath: string;
    showDevTools: boolean | null;
    latestCapture: UntappedCaptureFile | null;
    snippet: string;
};
export type UntappedCaptureStartResult = {
    changed: boolean;
    status: Omit<UntappedCaptureStatus, "snippet">;
    snippet: string;
};
export type UntappedCaptureStopResult = {
    changed: boolean;
    status: Omit<UntappedCaptureStatus, "snippet">;
};
export type UntappedCaptureImportSummary = UntappedImportSummary & {
    capture: UntappedCaptureFile;
};
