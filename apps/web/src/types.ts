export type ArenaFormat =
  | "standard"
  | "alchemy"
  | "explorer"
  | "historic"
  | "timeless"
  | "brawl"
  | "standardbrawl";

export type DeckFormat = ArenaFormat | "limited" | "other";

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

export type CardPrint = CardPrintDto;

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

export type StatsBreakdownTreeNode = StatsBreakdownItem & {
  kind: "type" | "subtype" | "tribe";
  children?: StatsBreakdownTreeNode[];
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
    subtypes: StatsBreakdownItem[];
    tribes: StatsBreakdownItem[];
    typeTree: StatsBreakdownTreeNode[];
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
  ownedCount?: number | null;
};

export type Deck = {
  id: string;
  name: string;
  format: DeckFormat;
  notes: string;
  createdAt: string;
  updatedAt: string;
  source: "local" | "arena";
  externalId: string | null;
  sourceFormat: string | null;
  sourceUpdatedAt: string | null;
  lastPlayedAt: string | null;
  isFavorite: boolean;
  cards: DeckCard[];
};

export type DeckListItem = {
  id: string;
  name: string;
  format: DeckFormat;
  notes: string;
  createdAt: string;
  updatedAt: string;
  source: "local" | "arena";
  externalId: string | null;
  sourceFormat: string | null;
  sourceUpdatedAt: string | null;
  lastPlayedAt: string | null;
  isFavorite: boolean;
  cardRows: number;
  totalCards: number;
};

export type ValidationResult = {
  deckId: string;
  format: DeckFormat;
  issues: string[];
  ownershipGaps: Array<{
    cardId: string;
    name: string;
    needed: number;
    owned: number;
    missing: number;
  }>;
};

export type ArenaDeckSyncSummary = {
  source: "arena-player-log";
  logPath: string;
  logModifiedAt: string;
  totalDecksFound: number;
  userDecksFound: number;
  starterDecksFound: number;
  includeStarterDecks: boolean;
  decksIncluded: number;
  placeholderCardCount: number;
  unresolvedArenaCardIds: number[];
  newDecks: number;
  changedDecks: number;
  unchangedDecks: number;
  retainedMissingDecks: number;
  specialFormatDecks: number;
  importedAt?: string;
  decksCreated?: number;
  decksUpdated?: number;
  importedDeckIds?: string[];
};

export type DeckBulkExport = {
  deckCount: number;
  decks: Array<{
    deckId: string;
    name: string;
    format: DeckFormat;
    text: string;
  }>;
  text: string;
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
  cardData: {
    source: string;
    sourceUpdatedAt: string | null;
    downloadUri: string | null;
    syncedAt: string | null;
    cardCount: number;
    printCount: number;
    formats: ArenaFormat[];
  };
};

export type CollectionDiff = {
  addedTitles: number;
  removedTitles: number;
  changedTitles: number;
  unchangedTitles: number;
};

export type CollectionCsvRow = {
  Id: string;
  Name: string;
  Set: string;
  Color: string;
  Rarity: string;
  Count: string;
  PrintCount: string;
};

export type CollectionCsvPreview = {
  source: "collection-csv";
  importedAt?: string;
  rowsRead: number;
  cardsMatched: number;
  ownedTitles: number;
  ownedCopies: number;
  rawOwnedCopies: number;
  unresolvedRows: CollectionCsvRow[];
  diff: CollectionDiff;
};

export type CollectionImportHistoryItem = {
  id: string;
  source: string;
  importedAt: string;
  metadata: Record<string, unknown>;
  cardEntries: number;
  ownedCopies: number;
  rawOwnedCopies: number;
};

export type CollectionRestoreResult = {
  id: string;
  restoredFrom: string;
  importedAt: string;
};

export type CollectorSnapshotMetadata = {
  snapshotVersion: number;
  status?: "complete";
  capturedAt?: string;
  platform?: string;
  collectorVersion?: string;
  mtgaPid?: number;
  mtgaBuild?: string;
  entryCount?: number;
  totalQuantity?: number;
  diagnostics?: {
    source?: string;
    warnings?: string[];
  };
};

export type CollectionImportSummary = {
  source: "untapped-json" | "collector-snapshot";
  importedAt?: string;
  extractedPath: string;
  catalogSource: "database" | "untapped-public" | "hybrid";
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
  diff: CollectionDiff;
};

export type UntappedImportSummary = CollectionImportSummary;

export type CollectorCaptureFile = {
  id: string;
  path: string;
  filename: string;
  size: number;
  modifiedAt: string;
};

export type CollectorCaptureStatus = {
  enabled: boolean;
  available: boolean;
  readyToCapture: boolean;
  disabledReason?: string;
  snapshotPath: string;
  addonPath: string;
  addonAvailable: boolean;
  codesignAvailable: boolean;
  scriptAvailable: boolean;
  mtgaRunning: boolean;
  mtgaPid: number | null;
  latestCapture: CollectorCaptureFile | null;
  lastFailure: {
    code: string;
    message: string;
    occurredAt: string;
  } | null;
};

export type CollectorCaptureImportSummary = CollectionImportSummary & {
  capture: CollectorCaptureFile;
};

export type UntappedCaptureFile = {
  id: string;
  path: string;
  filename: string;
  size: number;
  modifiedAt: string;
  source: "automated" | "download";
};

export type UntappedCaptureStatus = {
  enabled: boolean;
  available: boolean;
  disabledReason?: string;
  configPath: string;
  downloadsPath: string;
  showDevTools: boolean | null;
  latestCapture: UntappedCaptureFile | null;
  companionInstalled: boolean;
  companionRunning: boolean;
  companionPid: number | null;
  automationState:
    | "not-installed"
    | "not-running"
    | "restart-required"
    | "connecting"
    | "ready"
    | "unavailable";
  readyToCapture: boolean;
  restartRequired: boolean;
  message: string;
  devToolsPort?: number;
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
  catalogSync?: {
    sourceUpdatedAt: string | null;
    syncedAt: string | null;
    cardCount: number;
    printCount: number;
  };
};
import type { CardPrintDto } from "@mtga/contracts";
