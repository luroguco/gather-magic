import { useEffect, useRef, useState, startTransition } from "react";
import {
  CardCornerVisual,
  CardMetaSummary,
  ColorStrip,
  getCardAccentColors,
  getMechanicSummary,
  OwnershipDots,
  RenderOraclePreview,
  trailingActionButtons,
  VerticalColorStrip
} from "./cardPresentation";
import {
  capturePreviewUntappedCollection,
  capturePreviewCollectorSnapshot,
  createDeck,
  exportAllDecks,
  exportDeck,
  getCard,
  getCollectionImportHistory,
  getCollectorHelperStatus,
  importCollectorSnapshot,
  getDeck,
  getMechanics,
  getStatus,
  importLatestCollectorSnapshot,
  getUntappedHelperStatus,
  importUntappedCollection,
  importLatestUntappedCapture,
  listDecks,
  previewArenaDeckSync,
  previewLatestCollectorSnapshot,
  previewCollectionCsv,
  previewCollectorSnapshot,
  previewUntappedCollection,
  previewLatestUntappedCapture,
  restartUntappedCompanion,
  searchCards,
  startUntappedHelper,
  stopUntappedHelper,
  restoreCollectionImport,
  syncArenaDecks,
  updateDeck,
  uploadCollection,
  validateDeck
} from "./api";
import { DeckDisplayControls } from "./features/decks/DeckDisplayControls";
import { DecksScreen } from "./features/decks/DecksScreen";
import { useDeckWorkspace } from "./features/decks/useDeckWorkspace";
import { CoachScreen, type CoachSavePayload } from "./features/coach/CoachScreen";
import { ImportScreen } from "./features/import/ImportScreen";
import { useImportWorkflow } from "./features/import/useImportWorkflow";
import { useUntappedGuidePolling } from "./features/import/useUntappedGuidePolling";
import { buildCardSearchCsv, downloadCsvFile } from "./features/search/exportCards";
import { SearchScreen } from "./features/search/SearchScreen";
import { useCardSearch } from "./features/search/useCardSearch";
import {
  CARD_TYPES,
  buildSearchParams,
  clearDrilldownState,
  defaultSearch,
  DECK_FORMATS,
  FORMATS,
  ResultsViewMode,
  groupDerivedMechanics,
  groupKeywordMechanics,
  toggleValue,
  VISIBLE_RESULTS_STEP,
  type FilterState,
  type StatsDrilldownKind
} from "./features/shared/filterState";
import { useSyncedCardFilters } from "./features/shared/useSyncedCardFilters";
import { StatsScreen } from "./features/stats/StatsScreen";
import { useCardStats } from "./features/stats/useCardStats";
import type {
  AppStatus,
  ArenaDeckSyncSummary,
  CardDetail,
  CardSummary,
  CollectionImportHistoryItem,
  CollectionImportSummary,
  CollectorCaptureImportSummary,
  CollectorCaptureStatus,
  Deck,
  DeckCard,
  StatsBreakdownItem,
  UntappedCaptureFile,
  Mechanic,
  UntappedImportSummary
} from "./types";

const FAVORITES_STORAGE_KEY = "mtga.favorite-mechanics";
const RESULT_VIEW_STORAGE_KEY = "mtga.search-results-view";
const THEME_STORAGE_KEY = "mtga.app-theme";
const THEME_OPTIONS = [
  { value: "forest", label: "Forest", tone: "dark" },
  { value: "island", label: "Island", tone: "dark" },
  { value: "swamp", label: "Swamp", tone: "dark" },
  { value: "badlands", label: "Badlands", tone: "dark" },
  { value: "plains", label: "Plains", tone: "light" },
  { value: "coast", label: "Coast", tone: "light" },
  { value: "mountain", label: "Mountain", tone: "light" }
] as const;

const UNTAPPED_CAPTURE_SNIPPET = `(async () => {
  const collection = await window.electron.ipcRenderer.invoke("mtga.collection.invoke");
  const total = Object.values(collection ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  console.log("mtga.collection entries:", Object.keys(collection ?? {}).length);
  console.log("mtga.collection total quantity:", total);
  const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "untapped-mtga-collection.json";
  a.click();
  URL.revokeObjectURL(url);
})();`;
type AppTheme = (typeof THEME_OPTIONS)[number]["value"];
type TableSortKey =
  | "name"
  | "colors"
  | "manaValue"
  | "manaCost"
  | "typeLine"
  | "ownedCount"
  | "rawOwnedCount"
  | "set"
  | "rarity"
  | "mechanics";

const mergeDeckCard = (
  cards: DeckCard[],
  cardId: string,
  section: DeckCard["section"]
): DeckCard[] => {
  const existing = cards.find((card) => card.cardId === cardId && card.section === section);
  if (!existing) {
    return [...cards, { cardId, quantity: 1, section }];
  }
  return cards.map((card) =>
    card.cardId === cardId && card.section === section
      ? { ...card, quantity: card.quantity + 1 }
      : card
  );
};

const formatDateTime = (value: string | null) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";

const formatOwnedCount = (card: CardSummary) => {
  if (card.rawOwnedCount <= 0) {
    return "0 owned";
  }
  if (card.deckBuildingLimit === null || card.rawOwnedCount === card.ownedCount) {
    return `${card.rawOwnedCount} owned`;
  }
  return `${card.ownedCount} playable · ${card.rawOwnedCount} owned`;
};

const compareText = (left: string, right: string) => left.localeCompare(right);
const compareNumber = (left: number, right: number) => left - right;
const getFormatLabel = (format: Deck["format"]) =>
  DECK_FORMATS.find(([value]) => value === format)?.[1] ?? format;
const truncateDeckName = (name: string, max = 16) =>
  name.length <= max ? name : `${name.slice(0, Math.max(1, max - 3))}...`;
const getDeckTypeBucket = (typeLine: string) =>
  CARD_TYPES.find((type) => typeLine.toLowerCase().includes(type.toLowerCase())) ?? "Other";
const getUntappedSearchUrl = (cardName: string) =>
  `https://duckduckgo.com/?q=${encodeURIComponent(`site:mtga.untapped.gg/meta/cards "${cardName}"`)}`;

const formatFileSize = (size: number) =>
  size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;

const downloadTextFile = (filename: string, text: string) => {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const getCollectorCaptureIdentity = (capture: CollectorCaptureStatus["latestCapture"] | null) =>
  capture ? `${capture.path}::${capture.modifiedAt}` : null;
const getUntappedCaptureIdentity = (capture: UntappedCaptureFile | null) =>
  capture?.id ?? null;

function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const {
    searchState,
    setSearchState,
    deferredSearchState,
    statsState,
    setStatsState,
    deferredStatsState,
    updateSearchFilters,
    updateStatsFilters,
    openStatsSearchView,
    openStatsDrilldown
  } = useSyncedCardFilters();
  const {
    deckList,
    setDeckList,
    activeDeck,
    setActiveDeck,
    validation,
    setValidation,
    exportText,
    setExportText,
    deckName,
    setDeckName,
    deckFormat,
    setDeckFormat,
    quickDeckName,
    setQuickDeckName,
    quickDeckFormat,
    setQuickDeckFormat,
    deckDrawerOpen,
    setDeckDrawerOpen,
    pendingAdd,
    setPendingAdd,
    deckTargetMenuOpen,
    setDeckTargetMenuOpen,
    drawerCreateMode,
    setDrawerCreateMode,
    deckSort,
    setDeckSort,
    deckGroup,
    setDeckGroup
  } = useDeckWorkspace();
  const [activeTab, setActiveTab] = useState<
    "search" | "coach" | "stats" | "decks" | "import"
  >("search");
  const [importMessage, setImportMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [arenaDeckPreview, setArenaDeckPreview] =
    useState<ArenaDeckSyncSummary | null>(null);
  const [arenaDeckPreviewLoading, setArenaDeckPreviewLoading] = useState(false);
  const [arenaDeckSyncing, setArenaDeckSyncing] = useState(false);
  const [includeStarterDecks, setIncludeStarterDecks] = useState(false);
  const [bulkDeckExportLoading, setBulkDeckExportLoading] = useState(false);
  const [bulkDeckExportStatus, setBulkDeckExportStatus] = useState<
    "idle" | "copied" | "downloaded"
  >("idle");
  const {
    csvFile,
    setCsvFile,
    csvPreview,
    setCsvPreview,
    csvPreviewLoading,
    setCsvPreviewLoading,
    csvImporting,
    setCsvImporting,
    collectorSnapshotFile,
    setCollectorSnapshotFile,
    collectorSnapshotPreview,
    setCollectorSnapshotPreview,
    collectorSnapshotPreviewLoading,
    setCollectorSnapshotPreviewLoading,
    collectorSnapshotImporting,
    setCollectorSnapshotImporting,
    collectorHelperStatus,
    setCollectorHelperStatus,
    collectorHelperLoading,
    setCollectorHelperLoading,
    collectorStatusRefreshing,
    setCollectorStatusRefreshing,
    collectorPreviewSource,
    setCollectorPreviewSource,
    collectorSnapshotError,
    setCollectorSnapshotError,
    untappedFile,
    setUntappedFile,
    untappedPreview,
    setUntappedPreview,
    untappedPreviewLoading,
    setUntappedPreviewLoading,
    untappedImporting,
    setUntappedImporting,
    untappedHelperStatus,
    setUntappedHelperStatus,
    untappedHelperLoading,
    setUntappedHelperLoading,
    untappedGuideActive,
    setUntappedGuideActive,
    untappedPreviewSource,
    setUntappedPreviewSource,
    lastAutoPreviewedCaptureId,
    setLastAutoPreviewedCaptureId
  } = useImportWorkflow();
  const [importHistory, setImportHistory] = useState<CollectionImportHistoryItem[]>([]);
  const [importHistoryLoading, setImportHistoryLoading] = useState(false);
  const [restoringImportId, setRestoringImportId] = useState<string | null>(null);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [cardDetail, setCardDetail] = useState<CardDetail | null>(null);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [searchExportLoading, setSearchExportLoading] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof window === "undefined") {
      return "forest";
    }
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_OPTIONS.some((option) => option.value === raw) ? (raw as AppTheme) : "forest";
  });
  const [favoriteMechanics, setFavoriteMechanics] = useState<string[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    try {
      const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [keywordsExpanded, setKeywordsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ResultsViewMode>(() => {
    if (typeof window === "undefined") {
      return "grid";
    }
    const raw = window.localStorage.getItem(RESULT_VIEW_STORAGE_KEY);
    return raw === "list" || raw === "table" ? raw : "grid";
  });
  const [tableSort, setTableSort] = useState<{ key: TableSortKey; direction: "asc" | "desc" }>({
    key: "ownedCount",
    direction: "desc"
  });
  const searchScrollTopRef = useRef(0);
  const shouldRestoreSearchScrollRef = useRef(false);
  const cardDetailCacheRef = useRef<Record<string, CardDetail>>({});
  const {
    cards,
    cardsTotal,
    visibleResultsCount,
    setVisibleResultsCount,
    searchLoading
  } = useCardSearch(deferredSearchState, (message) => setErrorMessage(message));
  const { cardStats, statsLoading } = useCardStats(deferredStatsState, (message) => setErrorMessage(message));

  const switchTab = (nextTab: typeof activeTab) => {
    if (typeof window !== "undefined" && activeTab === "search" && nextTab !== "search") {
      searchScrollTopRef.current = window.scrollY;
    }
    if (activeTab !== "search" && nextTab === "search") {
      shouldRestoreSearchScrollRef.current = true;
    }
    setActiveTab(nextTab);
  };

  const loadStatus = async () => {
    const nextStatus = await getStatus();
    setStatus(nextStatus);
  };

  const refreshUntappedHelperStatus = async () => {
    const nextStatus = await getUntappedHelperStatus();
    setUntappedHelperStatus(nextStatus);
    return nextStatus;
  };

  const refreshCollectorHelperStatus = async () => {
    const nextStatus = await getCollectorHelperStatus();
    setCollectorHelperStatus(nextStatus);
    return nextStatus;
  };

  const handleRefreshCollectorStatus = async () => {
    try {
      setCollectorStatusRefreshing(true);
      setCollectorSnapshotError("");
      await refreshCollectorHelperStatus();
    } catch (error) {
      setCollectorSnapshotError(
        error instanceof Error ? error.message : "Failed to check for MTG Arena."
      );
    } finally {
      setCollectorStatusRefreshing(false);
    }
  };

  const refreshImportHistory = async () => {
    setImportHistoryLoading(true);
    try {
      const items = await getCollectionImportHistory();
      setImportHistory(items);
      return items;
    } finally {
      setImportHistoryLoading(false);
    }
  };

  const copyUntappedSnippetToClipboard = async (snippet: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(snippet);
      return true;
    } catch {
      return false;
    }
  };

  const refreshCollectionViewsAfterImport = async () => {
    await Promise.all([loadStatus(), loadDecks(activeDeck?.id)]);
    startTransition(() => {
      setSearchState((current) => ({ ...current }));
      setStatsState((current) => ({ ...current }));
    });
  };

  const loadDecks = async (selectDeckId?: string) => {
    const decks = await listDecks();
    setDeckList(decks);
    const targetDeckId = selectDeckId ?? activeDeck?.id ?? decks[0]?.id;
    if (targetDeckId) {
      const [deck, arenaExport] = await Promise.all([
        getDeck(targetDeckId),
        exportDeck(targetDeckId)
      ]);
      setActiveDeck(deck);
      setValidation(null);
      setExportText(arenaExport.text);
    } else {
      setActiveDeck(null);
      setValidation(null);
      setExportText("");
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [nextMechanics] = await Promise.all([
          getMechanics({ ownedOnly: defaultSearch.ownedOnly }),
          loadStatus(),
          loadDecks()
        ]);
        setMechanics(nextMechanics);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to load the app.");
      }
    };
    void bootstrap();
  }, []);

  useEffect(() => {
    const runMechanicsRefresh = async () => {
      try {
        const ownedOnly = activeTab === "stats" ? statsState.ownedOnly : searchState.ownedOnly;
        const items = await getMechanics({ ownedOnly });
        setMechanics(items);
        if (ownedOnly) {
          const available = new Set(items.map((item) => item.slug));
          setSearchState((current) => ({
            ...current,
            mechanics: current.mechanics.filter((mechanic) => available.has(mechanic))
          }));
          setStatsState((current) => ({
            ...current,
            mechanics: current.mechanics.filter((mechanic) => available.has(mechanic))
          }));
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Mechanic list refresh failed.");
      }
    };
    void runMechanicsRefresh();
  }, [activeTab, searchState.ownedOnly, statsState.ownedOnly]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favoriteMechanics));
  }, [favoriteMechanics]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(RESULT_VIEW_STORAGE_KEY, viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (activeTab !== "search" || !shouldRestoreSearchScrollRef.current || typeof window === "undefined") {
      return;
    }

    shouldRestoreSearchScrollRef.current = false;
    const restore = () => window.scrollTo({ top: searchScrollTopRef.current, behavior: "auto" });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(restore);
    });
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "import") {
      return;
    }

    void refreshCollectorHelperStatus().catch((error) => {
      setCollectorSnapshotError(
        error instanceof Error ? error.message : "Failed to check direct Arena import."
      );
    });
    void refreshUntappedHelperStatus().catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to check Untapped Companion."
      );
    });
    void refreshImportHistory().catch((error) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load collection update history."
      );
    });
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== "import" || typeof window === "undefined") {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (
        collectorHelperLoading ||
        collectorStatusRefreshing ||
        collectorSnapshotPreviewLoading ||
        collectorSnapshotImporting
      ) {
        return;
      }
      void refreshCollectorHelperStatus().catch(() => undefined);
      if (
        !untappedGuideActive &&
        !untappedHelperLoading &&
        !untappedPreviewLoading &&
        !untappedImporting
      ) {
        void refreshUntappedHelperStatus().catch(() => undefined);
      }
    }, 4_000);

    return () => window.clearInterval(intervalId);
  }, [
    activeTab,
    collectorHelperLoading,
    collectorSnapshotImporting,
    collectorSnapshotPreviewLoading,
    collectorStatusRefreshing,
    untappedGuideActive,
    untappedHelperLoading,
    untappedImporting,
    untappedPreviewLoading
  ]);

  useUntappedGuidePolling({
    activeTab: activeTab === "coach" ? "search" : activeTab,
    untappedGuideActive,
    lastAutoPreviewedCaptureId,
    setUntappedHelperStatus,
    setUntappedGuideActive,
    setLastAutoPreviewedCaptureId,
    setUntappedPreviewLoading,
    setUntappedFile,
    setUntappedPreview,
    setUntappedPreviewSource,
    setImportMessage,
    onError: (message) => setErrorMessage(message)
  });

  const saveDeck = async (deck: Deck) => {
    const saved = await updateDeck(deck.id, {
      name: deck.name,
      format: deck.format,
      notes: deck.notes,
      cards: deck.cards
    });
    setActiveDeck(saved);
    await loadDecks(saved.id);
    const nextValidation = await validateDeck(saved.id);
    setValidation(nextValidation);
    const arenaExport = await exportDeck(saved.id);
    setExportText(arenaExport.text);
  };

  const createAndSelectDeck = async (name: string, format: Deck["format"]) => {
    const created = await createDeck({
      name,
      format,
      notes: ""
    });
    setActiveDeck(created);
    const decks = await listDecks();
    setDeckList(decks);
    setValidation(await validateDeck(created.id));
    setExportText((await exportDeck(created.id)).text);
    return created;
  };

  const handleCreateDeck = async () => {
    try {
      const created = await createAndSelectDeck(deckName, deckFormat);
      setDeckName("New Arena Deck");
      switchTab("decks");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create deck.");
    }
  };

  const handleSaveCoachDeck = async (
    payload: CoachSavePayload,
    options: { deckId: string | null; openEditor: boolean }
  ) => {
    const saved = options.deckId
      ? await updateDeck(options.deckId, payload)
      : await createDeck(payload);
    await loadDecks(saved.id);
    setValidation(await validateDeck(saved.id));
    setExportText((await exportDeck(saved.id)).text);
    if (options.openEditor) {
      switchTab("decks");
    }
    return saved.id;
  };

  const handlePreviewArenaDecks = async () => {
    try {
      setArenaDeckPreviewLoading(true);
      setErrorMessage("");
      setImportMessage("");
      setArenaDeckPreview(await previewArenaDeckSync(includeStarterDecks));
    } catch (error) {
      setArenaDeckPreview(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to read saved Arena decks."
      );
    } finally {
      setArenaDeckPreviewLoading(false);
    }
  };

  const handleSyncArenaDecks = async () => {
    try {
      setArenaDeckSyncing(true);
      setErrorMessage("");
      const result = await syncArenaDecks(includeStarterDecks);
      const targetDeckId = result.importedDeckIds?.[0];
      await loadDecks(targetDeckId);
      if (targetDeckId) {
        setValidation(await validateDeck(targetDeckId));
        setExportText((await exportDeck(targetDeckId)).text);
      }
      setArenaDeckPreview(await previewArenaDeckSync(includeStarterDecks));
      const changed = (result.decksCreated ?? 0) + (result.decksUpdated ?? 0);
      setImportMessage(
        changed > 0
          ? `Synced ${changed} Arena deck${changed === 1 ? "" : "s"} without changing local-only decks.`
          : "Your Arena decks are already up to date."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to sync saved Arena decks."
      );
    } finally {
      setArenaDeckSyncing(false);
    }
  };

  const handleCopyAllDecks = async () => {
    try {
      setBulkDeckExportLoading(true);
      setBulkDeckExportStatus("idle");
      setErrorMessage("");
      const bundle = await exportAllDecks();
      await navigator.clipboard.writeText(bundle.text);
      setBulkDeckExportStatus("copied");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to copy the deck bundle."
      );
    } finally {
      setBulkDeckExportLoading(false);
    }
  };

  const handleDownloadAllDecks = async () => {
    try {
      setBulkDeckExportLoading(true);
      setBulkDeckExportStatus("idle");
      setErrorMessage("");
      const bundle = await exportAllDecks();
      downloadTextFile(
        `mtga-decks-${new Date().toISOString().slice(0, 10)}.txt`,
        bundle.text
      );
      setBulkDeckExportStatus("downloaded");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to download the deck bundle."
      );
    } finally {
      setBulkDeckExportLoading(false);
    }
  };

  const handleSelectDeck = async (deckId: string) => {
    try {
      const deck = await getDeck(deckId);
      setActiveDeck(deck);
      setValidation(await validateDeck(deckId));
      setExportText((await exportDeck(deckId)).text);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load deck.");
    }
  };

  const addCardToDeck = async (deck: Deck, card: CardSummary, section: DeckCard["section"]) => {
    const nextDeck: Deck = {
      ...deck,
      cards: mergeDeckCard(deck.cards, card.id, section)
    };
    setActiveDeck(nextDeck);
    await saveDeck(nextDeck);
  };

  const handleAddCard = async (card: CardSummary, section: DeckCard["section"] = "main") => {
    if (!activeDeck) {
      setPendingAdd({ card, section });
      setQuickDeckFormat(searchState.format as Deck["format"]);
      setDrawerCreateMode(false);
      setDeckTargetMenuOpen(true);
      setDeckDrawerOpen(true);
      setErrorMessage("");
      return;
    }

    try {
      await addCardToDeck(activeDeck, card, section);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to add card to deck.");
    }
  };

  const handleChangeDeckQuantity = async (cardId: string, section: DeckCard["section"], delta: number) => {
    if (!activeDeck) {
      return;
    }

    const nextCards = activeDeck.cards
      .map((card) =>
        card.cardId === cardId && card.section === section
          ? { ...card, quantity: card.quantity + delta }
          : card
      )
      .filter((card) => card.quantity > 0);

    const nextDeck = { ...activeDeck, cards: nextCards };
    setActiveDeck(nextDeck);
    try {
      await saveDeck(nextDeck);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update deck quantity.");
    }
  };

  const handleCsvPreview = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      setErrorMessage("");
      setImportMessage("");
      setCsvFile(file);
      setCsvPreview(null);
      setCsvPreviewLoading(true);
      const preview = await previewCollectionCsv(file);
      setCsvPreview(preview);
      setImportMessage(`Reviewed ${file.name}. Nothing has been replaced yet.`);
    } catch (error) {
      setCsvFile(null);
      setCsvPreview(null);
      setErrorMessage(error instanceof Error ? error.message : "Collection CSV preview failed.");
    } finally {
      setCsvPreviewLoading(false);
    }
  };

  const handleConfirmCsvImport = async (confirmSuspiciousDiff: boolean) => {
    if (!csvFile) {
      return;
    }

    try {
      setErrorMessage("");
      setImportMessage("");
      setCsvImporting(true);
      const result = await uploadCollection(csvFile, confirmSuspiciousDiff);
      setCsvPreview(result);
      setImportMessage(
        `Collection updated with ${result.ownedCopies.toLocaleString()} copies across ${result.ownedTitles.toLocaleString()} cards.`
      );
      await refreshCollectionViewsAfterImport();
      await refreshImportHistory();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Collection import failed.");
    } finally {
      setCsvImporting(false);
    }
  };

  const handleCollectorSnapshotPreview = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      setErrorMessage("");
      setCollectorSnapshotError("");
      setImportMessage("");
      setCollectorSnapshotFile(file);
      setCollectorSnapshotPreview(null);
      setCollectorPreviewSource("manual-file");
      setCollectorSnapshotPreviewLoading(true);
      const preview = await previewCollectorSnapshot(file);
      setCollectorSnapshotPreview(preview);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Collector snapshot preview failed.";
      setCollectorSnapshotFile(null);
      setCollectorSnapshotPreview(null);
      setCollectorPreviewSource(null);
      setCollectorSnapshotError(message);
    } finally {
      setCollectorSnapshotPreviewLoading(false);
    }
  };

  const handleCaptureLatestCollectorSnapshot = async () => {
    try {
      setErrorMessage("");
      setCollectorSnapshotError("");
      setImportMessage("");
      setCollectorHelperLoading(true);
      setCollectorSnapshotPreviewLoading(true);
      setCollectorSnapshotFile(null);
      setCollectorSnapshotPreview(null);
      setCollectorPreviewSource("latest-capture");
      const preview = await capturePreviewCollectorSnapshot();
      setCollectorSnapshotPreview(preview);
      setImportMessage(
        "Read the live collection from MTG Arena. Review the changes before updating."
      );
      await refreshCollectorHelperStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to capture the live MTGA collection.";
      setCollectorPreviewSource(null);
      setCollectorSnapshotError(message);
      await refreshCollectorHelperStatus().catch(() => undefined);
    } finally {
      setCollectorHelperLoading(false);
      setCollectorSnapshotPreviewLoading(false);
    }
  };

  const handlePreviewLatestCollectorSnapshot = async () => {
    try {
      setErrorMessage("");
      setCollectorSnapshotError("");
      setImportMessage("");
      setCollectorHelperLoading(true);
      setCollectorSnapshotPreviewLoading(true);
      setCollectorSnapshotFile(null);
      setCollectorSnapshotPreview(null);
      setCollectorPreviewSource("latest-capture");
      const preview = await previewLatestCollectorSnapshot();
      setCollectorSnapshotPreview(preview);
      setImportMessage(`Previewed ${preview.capture.filename} from the local collector cache.`);
      await refreshCollectorHelperStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to preview the latest collector snapshot.";
      setCollectorPreviewSource(null);
      setCollectorSnapshotError(message);
    } finally {
      setCollectorHelperLoading(false);
      setCollectorSnapshotPreviewLoading(false);
    }
  };

  const handleConfirmCollectorSnapshotImport = async (confirmSuspiciousDiff: boolean) => {
    if (!collectorSnapshotFile && collectorPreviewSource !== "latest-capture") {
      return;
    }

    try {
      setErrorMessage("");
      setCollectorSnapshotError("");
      setImportMessage("");
      setCollectorSnapshotImporting(true);
      let result: CollectionImportSummary | CollectorCaptureImportSummary;

      if (collectorPreviewSource === "latest-capture") {
        if (
          !collectorSnapshotPreview ||
          !("capture" in collectorSnapshotPreview)
        ) {
          throw new Error("Read the collection from Arena again before importing.");
        }
        result = await importLatestCollectorSnapshot(
          collectorSnapshotPreview.capture.id,
          confirmSuspiciousDiff
        );
      } else if (collectorSnapshotFile) {
        result = await importCollectorSnapshot(collectorSnapshotFile, confirmSuspiciousDiff);
      } else {
        throw new Error("Choose a collector snapshot JSON or refresh from MTGA before importing.");
      }

      setCollectorSnapshotPreview(result);
      setImportMessage(
        `Updated from MTG Arena with ${result.ownedCopies} playable copies across ${result.ownedTitles} titles. ` +
          `${result.unresolvedCards.length} local matches unresolved, ${result.unmatchedGrpIds} grpIds unmatched.`
      );
      await refreshCollectionViewsAfterImport();
      await refreshCollectorHelperStatus();
      await refreshImportHistory();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Collector snapshot import failed.";
      setCollectorSnapshotError(message);
    } finally {
      setCollectorSnapshotImporting(false);
    }
  };

  const handleStartUntappedGuide = async () => {
    try {
      setErrorMessage("");
      setImportMessage("");
      setUntappedHelperLoading(true);
      const result = await startUntappedHelper();
      const nextStatus = {
        ...result.status,
        snippet: result.snippet
      };
      setUntappedHelperStatus(nextStatus);
      setUntappedGuideActive(true);
      setLastAutoPreviewedCaptureId(getUntappedCaptureIdentity(nextStatus.latestCapture));

      const copied = await copyUntappedSnippetToClipboard(result.snippet);
      setImportMessage(
        copied
          ? "Untapped guided capture started. The DevTools snippet is in your clipboard."
          : "Untapped guided capture started. Clipboard copy failed, so paste the snippet shown below manually."
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start the Untapped guided capture.");
    } finally {
      setUntappedHelperLoading(false);
    }
  };

  const handleCaptureUntappedCollection = async () => {
    try {
      setErrorMessage("");
      setImportMessage("");
      setUntappedPreviewLoading(true);
      const preview = await capturePreviewUntappedCollection();
      setUntappedFile(null);
      setUntappedPreview(preview);
      setUntappedPreviewSource("latest-capture");
      setLastAutoPreviewedCaptureId(preview.capture.id);
      setImportMessage(
        `${preview.catalogSync ? `Updated Scryfall to ${preview.catalogSync.cardCount.toLocaleString()} cards, then read ` : "Read "}` +
          `${preview.rawEntryCount.toLocaleString()} Arena entries through the free Companion app. Review the changes below.`
      );
      await refreshUntappedHelperStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to read the Arena collection through Companion."
      );
      await refreshUntappedHelperStatus().catch(() => undefined);
    } finally {
      setUntappedPreviewLoading(false);
    }
  };

  const handleRestartUntappedCompanion = async () => {
    try {
      setErrorMessage("");
      setImportMessage("");
      setUntappedHelperLoading(true);
      setUntappedPreviewLoading(true);
      const nextStatus = await restartUntappedCompanion();
      setUntappedHelperStatus(nextStatus);
      const preview = await capturePreviewUntappedCollection();
      setUntappedFile(null);
      setUntappedPreview(preview);
      setUntappedPreviewSource("latest-capture");
      setLastAutoPreviewedCaptureId(preview.capture.id);
      setImportMessage(
        `Companion restarted, ${preview.catalogSync ? `updated Scryfall to ${preview.catalogSync.cardCount.toLocaleString()} cards, and ` : "then "}` +
          `read ${preview.rawEntryCount.toLocaleString()} Arena entries. Review the changes below.`
      );
      await refreshUntappedHelperStatus();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Failed to restart Companion for automatic sync."
      );
      await refreshUntappedHelperStatus().catch(() => undefined);
    } finally {
      setUntappedHelperLoading(false);
      setUntappedPreviewLoading(false);
    }
  };

  const handleStopUntappedGuide = async () => {
    try {
      setErrorMessage("");
      setUntappedHelperLoading(true);
      const result = await stopUntappedHelper();
      setUntappedGuideActive(false);
      setUntappedHelperStatus((current) => ({
        ...(current ?? { snippet: UNTAPPED_CAPTURE_SNIPPET }),
        ...result.status
      }));
      setImportMessage("Untapped guided capture stopped. DevTools can be closed after restarting Companion.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to stop the Untapped guided capture.");
    } finally {
      setUntappedHelperLoading(false);
    }
  };

  const handleCopyUntappedSnippet = async () => {
    const snippet = untappedHelperStatus?.snippet || UNTAPPED_CAPTURE_SNIPPET;
    const copied = await copyUntappedSnippetToClipboard(snippet);
    if (copied) {
      setImportMessage("Untapped DevTools snippet copied to clipboard.");
      return;
    }

    setErrorMessage("Clipboard access failed. Paste the snippet from the panel below manually.");
  };

  const handlePreviewLatestUntappedCapture = async () => {
    try {
      setErrorMessage("");
      setImportMessage("");
      setUntappedPreviewLoading(true);
      const preview = await previewLatestUntappedCapture();
      setUntappedFile(null);
      setUntappedPreview(preview);
      setUntappedPreviewSource("latest-capture");
      setLastAutoPreviewedCaptureId(getUntappedCaptureIdentity(preview.capture));
      setImportMessage(`Previewed ${preview.capture.filename} from your Downloads folder.`);
      await refreshUntappedHelperStatus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to preview the latest Untapped capture.");
    } finally {
      setUntappedPreviewLoading(false);
    }
  };

  const handleUntappedPreview = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      setErrorMessage("");
      setImportMessage("");
      setUntappedFile(file);
      setUntappedPreview(null);
      setUntappedPreviewSource("manual-file");
      setUntappedPreviewLoading(true);
      const preview = await previewUntappedCollection(file);
      setUntappedPreview(preview);
    } catch (error) {
      setUntappedFile(null);
      setUntappedPreview(null);
      setUntappedPreviewSource(null);
      setErrorMessage(error instanceof Error ? error.message : "Untapped preview failed.");
    } finally {
      setUntappedPreviewLoading(false);
    }
  };

  const handleConfirmUntappedImport = async (confirmSuspiciousDiff: boolean) => {
    if (!untappedPreviewSource) {
      return;
    }

    try {
      setErrorMessage("");
      setImportMessage("");
      setUntappedImporting(true);
      let result: UntappedImportSummary;

      if (untappedPreviewSource === "latest-capture") {
        const captureId =
          untappedPreview && "capture" in untappedPreview
            ? untappedPreview.capture.id
            : untappedHelperStatus?.latestCapture?.id;
        if (!captureId) {
          throw new Error("Sync from Arena again before importing.");
        }
        const latestResult = await importLatestUntappedCapture(
          captureId,
          confirmSuspiciousDiff
        );
        setLastAutoPreviewedCaptureId(getUntappedCaptureIdentity(latestResult.capture));
        result = latestResult;
      } else if (untappedFile) {
        result = await importUntappedCollection(untappedFile, confirmSuspiciousDiff);
      } else {
        throw new Error("Choose an Untapped JSON file or preview the latest capture before importing.");
      }

      setUntappedPreview(result);
      setImportMessage(
        `Imported ${result.ownedCopies} playable copies across ${result.ownedTitles} titles from Untapped Companion. ` +
          `${result.unresolvedCards.length} local matches unresolved, ${result.unmatchedGrpIds} grpIds unmatched.`
      );
      await refreshCollectionViewsAfterImport();
      await refreshUntappedHelperStatus();
      await refreshImportHistory();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Untapped import failed.");
    } finally {
      setUntappedImporting(false);
    }
  };

  const handleRestoreCollectionImport = async (importId: string) => {
    try {
      setErrorMessage("");
      setImportMessage("");
      setRestoringImportId(importId);
      await restoreCollectionImport(importId);
      setCsvFile(null);
      setCsvPreview(null);
      setUntappedFile(null);
      setUntappedPreview(null);
      setUntappedPreviewSource(null);
      setCollectorSnapshotFile(null);
      setCollectorSnapshotPreview(null);
      setCollectorPreviewSource(null);
      setImportMessage("Previous collection restored.");
      await refreshCollectionViewsAfterImport();
      await refreshImportHistory();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to restore that collection update.");
    } finally {
      setRestoringImportId(null);
    }
  };

  const handleSelectDeckForPendingAdd = async (deckId: string) => {
    try {
      const deck = await getDeck(deckId);
      setActiveDeck(deck);
      setValidation(await validateDeck(deckId));
      setExportText((await exportDeck(deckId)).text);
      setDeckTargetMenuOpen(false);
      setDrawerCreateMode(false);
      if (pendingAdd) {
        const nextPending = pendingAdd;
        setPendingAdd(null);
        await addCardToDeck(deck, nextPending.card, nextPending.section);
        return;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to select deck.");
    }
  };

  const handleQuickCreateDeck = async () => {
    try {
      const created = await createAndSelectDeck(quickDeckName, quickDeckFormat);
      setQuickDeckName("Search Deck");
      setQuickDeckFormat(searchState.format as Deck["format"]);
      setDeckTargetMenuOpen(false);
      setDrawerCreateMode(false);
      if (pendingAdd) {
        const nextPending = pendingAdd;
        setPendingAdd(null);
        await addCardToDeck(created, nextPending.card, nextPending.section);
        return;
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create deck.");
    }
  };

  const handleOpenDeckDetails = () => {
    setDeckDrawerOpen(false);
    switchTab("decks");
  };

  const deckCardsById = new Map<string, CardSummary>(cards.map((card) => [card.id, card]));
  const sortedMechanics = [...mechanics].sort((left, right) => {
    const usageDiff = right.usageCount - left.usageCount;
    if (usageDiff !== 0) {
      return usageDiff;
    }
    return left.label.localeCompare(right.label);
  });
  const glossaryItems = sortedMechanics.filter((mechanic) => {
    const query = glossaryQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }
    return (
      mechanic.label.toLowerCase().includes(query) ||
      mechanic.definition.toLowerCase().includes(query) ||
      mechanic.slug.toLowerCase().includes(query)
    );
  });
  const favoriteSet = new Set(favoriteMechanics);
  const getSelectedMechanics = (state: FilterState) =>
    state.mechanics
      .map((slug) => sortedMechanics.find((mechanic) => mechanic.slug === slug))
      .filter((mechanic): mechanic is Mechanic => Boolean(mechanic));
  const selectedSearchMechanics = getSelectedMechanics(searchState);
  const selectedStatsMechanics = getSelectedMechanics(statsState);
  const sidebarMechanicSelection = activeTab === "stats" ? statsState.mechanics : searchState.mechanics;
  const sidebarFavorites = sortedMechanics.filter((mechanic) => favoriteSet.has(mechanic.slug));
  const sidebarDerivedGroups = groupDerivedMechanics(
    sortedMechanics.filter((mechanic) => mechanic.type === "derived" && !favoriteSet.has(mechanic.slug))
  );
  const glossaryFavorites = glossaryItems.filter((mechanic) => favoriteSet.has(mechanic.slug));
  const glossaryDerivedGroups = groupDerivedMechanics(
    glossaryItems.filter((mechanic) => mechanic.type === "derived" && !favoriteSet.has(mechanic.slug))
  );
  const glossaryKeywordGroups = groupKeywordMechanics(
    glossaryItems.filter((mechanic) => mechanic.type === "keyword" && !favoriteSet.has(mechanic.slug))
  );

  const toggleMechanic = (slug: string) => {
    if (activeTab === "stats") {
      setStatsState((current) => ({
        ...current,
        mechanics: toggleValue(current.mechanics, slug)
      }));
      return;
    }

    setSearchState((current) => ({
      ...current,
      mechanics: toggleValue(current.mechanics, slug)
    }));
  };

  const toggleFavoriteMechanic = (slug: string) => {
    setFavoriteMechanics((current) => toggleValue(current, slug));
  };

  const toggleTableSort = (key: TableSortKey) => {
    setTableSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "asc" ? "desc" : "asc"
          }
        : {
            key,
            direction: key === "name" || key === "typeLine" || key === "set" || key === "rarity" || key === "mechanics" ? "asc" : "desc"
          }
    );
  };

  const sortedCards = [...cards].sort((left, right) => {
    let result = 0;
    switch (tableSort.key) {
      case "name":
        result = compareText(left.name, right.name);
        break;
      case "colors":
        result = compareText(getCardAccentColors(left).join(""), getCardAccentColors(right).join(""));
        break;
      case "manaValue":
        result = compareNumber(left.manaValue, right.manaValue);
        break;
      case "manaCost":
        result = compareText(left.manaCost ?? "", right.manaCost ?? "");
        break;
      case "typeLine":
        result = compareText(left.typeLine, right.typeLine);
        break;
      case "ownedCount":
        result = compareNumber(left.ownedCount, right.ownedCount);
        break;
      case "rawOwnedCount":
        result = compareNumber(left.rawOwnedCount, right.rawOwnedCount);
        break;
      case "set":
        result = compareText(left.preferredSetCode ?? "", right.preferredSetCode ?? "");
        break;
      case "rarity":
        result = compareText(left.rarity, right.rarity);
        break;
      case "mechanics":
        result = compareText(getMechanicSummary(left, 4), getMechanicSummary(right, 4));
        break;
    }
    return tableSort.direction === "asc" ? result : -result;
  });
  const visibleCards = cards.slice(0, visibleResultsCount);
  const visibleSortedCards = sortedCards.slice(0, visibleResultsCount);
  const activeDeckCards = activeDeck?.cards ?? [];
  const activeDeckTotalCards = activeDeckCards.reduce((total, deckCard) => total + deckCard.quantity, 0);
  const activeDeckSectionTotals = activeDeckCards.reduce(
    (totals, deckCard) => ({
      main: totals.main + (deckCard.section === "main" ? deckCard.quantity : 0),
      sideboard: totals.sideboard + (deckCard.section === "sideboard" ? deckCard.quantity : 0),
      commander: totals.commander + (deckCard.section === "commander" ? deckCard.quantity : 0)
    }),
    { main: 0, sideboard: 0, commander: 0 }
  );
  const deckDisplayCards = activeDeckCards.map((deckCard, index) => {
    const card = deckCardsById.get(deckCard.cardId);
    return {
      ...deckCard,
      addedIndex: index,
      displayName: card?.name ?? deckCard.cardName ?? deckCard.cardId,
      displayTypeLine: card?.typeLine ?? deckCard.typeLine ?? "",
      displayManaCost: card?.manaCost ?? deckCard.manaCost ?? "",
      displayManaValue: card?.manaValue ?? deckCard.manaValue ?? 0,
      displayOwnedCount: deckCard.ownedCount
    };
  });
  const sortedDeckDisplayCards = [...deckDisplayCards].sort((left, right) => {
    let result = 0;
    switch (deckSort) {
      case "added":
        result = compareNumber(left.addedIndex, right.addedIndex);
        break;
      case "name":
        result = compareText(left.displayName, right.displayName);
        break;
      case "manaValue":
        result = compareNumber(left.displayManaValue, right.displayManaValue) || compareText(left.displayName, right.displayName);
        break;
      case "typeLine":
        result = compareText(left.displayTypeLine, right.displayTypeLine) || compareText(left.displayName, right.displayName);
        break;
      case "quantity":
        result = compareNumber(right.quantity, left.quantity) || compareText(left.displayName, right.displayName);
        break;
    }
    return result;
  });
  const deckCardGroups = (() => {
    const grouped = new Map<string, { label: string; orderValue: number | string; items: typeof sortedDeckDisplayCards }>();
    const sectionOrder = { commander: 0, main: 1, sideboard: 2 };
    for (const deckCard of sortedDeckDisplayCards) {
      let key = "all";
      let label = "All cards";
      let orderValue: number | string = 0;
      if (deckGroup === "section") {
        key = deckCard.section;
        label = deckCard.section === "sideboard" ? "Sideboard" : deckCard.section === "commander" ? "Commander" : "Main deck";
        orderValue = sectionOrder[deckCard.section];
      } else if (deckGroup === "typeLine") {
        key = getDeckTypeBucket(deckCard.displayTypeLine);
        label = key;
        orderValue = key;
      } else if (deckGroup === "manaValue") {
        key = String(deckCard.displayManaValue);
        label = `MV ${deckCard.displayManaValue}`;
        orderValue = deckCard.displayManaValue;
      }

      const existing = grouped.get(key);
      if (existing) {
        existing.items.push(deckCard);
      } else {
        grouped.set(key, {
          label,
          orderValue,
          items: [deckCard]
        });
      }
    }

    return [...grouped.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((left, right) => {
        if (typeof left.orderValue === "number" && typeof right.orderValue === "number") {
          return left.orderValue - right.orderValue;
        }
        return compareText(String(left.orderValue), String(right.orderValue));
      });
  })();
  const selectedDeckLabel = activeDeck ? truncateDeckName(activeDeck.name) : "Choose deck";
  const activeTheme = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[0];
  const darkThemes = THEME_OPTIONS.filter((option) => option.tone === "dark");
  const lightThemes = THEME_OPTIONS.filter((option) => option.tone === "light");

  const showCommanderAction = activeDeck?.format === "brawl" || activeDeck?.format === "standardbrawl";
  const renderActions = (card: CardSummary) => trailingActionButtons(card, showCommanderAction, handleAddCard);
  const openCardDetail = async (card: CardSummary) => {
    const cached = cardDetailCacheRef.current[card.id];
    if (cached) {
      setCardDetail(cached);
      return;
    }
    try {
      setCardDetailLoading(true);
      const detail = await getCard(card.id);
      cardDetailCacheRef.current[card.id] = detail;
      setCardDetail(detail);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load card details.");
    } finally {
      setCardDetailLoading(false);
    }
  };
  const handleOpenStatsSearchView = () => {
    openStatsSearchView();
    switchTab("search");
  };

  const handleOpenStatsDrilldown = (
    drilldownKind: StatsDrilldownKind,
    item: StatsBreakdownItem
  ) => {
    openStatsDrilldown(drilldownKind, item);
    switchTab("search");
  };

  const handleExportSearch = async () => {
    try {
      setErrorMessage("");
      setImportMessage("");
      setSearchExportLoading(true);
      const response = await searchCards(buildSearchParams(searchState));
      const csv = buildCardSearchCsv(response.items);
      const dateStamp = new Date().toISOString().slice(0, 10);
      downloadCsvFile(`mtga-card-search-${dateStamp}.csv`, csv);
      setImportMessage(`Exported ${response.items.length.toLocaleString()} filtered card results.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Search export failed.");
    } finally {
      setSearchExportLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-brand compact-brand">
            <h1>Collection Explorer</h1>
          </div>
          <nav className="tab-strip app-tabs compact-tabs">
            {[
              ["search", "Search"],
              ["coach", "Coach Beta"],
              ["stats", "Stats"],
              ["decks", "Decks"]
            ].map(([tab, label]) => (
              <button
                aria-current={activeTab === tab ? "page" : undefined}
                key={tab}
                className={activeTab === tab ? "tab-button active" : "tab-button"}
                onClick={() => switchTab(tab as typeof activeTab)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="app-header-right">
          <details className="header-menu">
            <summary className="header-menu-trigger">Catalog</summary>
            <div className="header-menu-panel stats-menu">
              <div className="header-stat-row">
                <span>Catalog</span>
                <strong>{status?.cards.total ?? 0}</strong>
              </div>
              <div className="header-stat-row">
                <span>Unique names</span>
                <strong>{status?.collection.uniqueNames ?? 0}</strong>
              </div>
              <div className="header-stat-row">
                <span>Owned copies</span>
                <strong>{status?.collection.ownedCopies ?? 0}</strong>
              </div>
              <div className="header-stat-row">
                <span>Owned rows</span>
                <strong>{status?.collection.importRowsWithCopies ?? 0}</strong>
              </div>
            </div>
          </details>

          <details className="header-menu">
            <summary className="header-menu-trigger">
              <span className={`scheme-tone ${activeTheme.tone}`} aria-hidden="true" />
              <span>{activeTheme.label}</span>
            </summary>
            <div className="header-menu-panel theme-menu">
              <div className="theme-menu-group">
                <span className="theme-menu-heading">Dark</span>
                {darkThemes.map((option) => (
                  <button
                    className={theme === option.value ? "theme-menu-item active" : "theme-menu-item"}
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    type="button"
                  >
                    <span className={`scheme-tone ${option.tone}`} aria-hidden="true" />
                    <span>{option.label}</span>
                    <small>{option.tone}</small>
                  </button>
                ))}
              </div>
              <div className="theme-menu-group">
                <span className="theme-menu-heading">Light</span>
                {lightThemes.map((option) => (
                  <button
                    className={theme === option.value ? "theme-menu-item active" : "theme-menu-item"}
                    key={option.value}
                    onClick={() => setTheme(option.value)}
                    type="button"
                  >
                    <span className={`scheme-tone ${option.tone}`} aria-hidden="true" />
                    <span>{option.label}</span>
                    <small>{option.tone}</small>
                  </button>
                ))}
              </div>
            </div>
          </details>

          <button
            aria-current={activeTab === "import" ? "page" : undefined}
            className={activeTab === "import" ? "tab-button active" : "tab-button"}
            onClick={() => switchTab("import")}
            type="button"
          >
            Collection
          </button>
        </div>
      </header>

      {activeTab !== "import" && errorMessage ? (
        <div className="banner error" role="alert">
          {errorMessage}
        </div>
      ) : null}
      {activeTab !== "import" && importMessage ? (
        <div aria-live="polite" className="banner success" role="status">
          {importMessage}
        </div>
      ) : null}
      {status && status.cards.total === 0 ? (
        <div className="banner warning">
          No Arena catalog is loaded yet. Run <code>npm run db:sync</code> from the project root,
          then refresh the app.
        </div>
      ) : null}

      <main className={activeTab === "search" || activeTab === "stats" ? "app-main search-main" : "app-main"}>
        {activeTab === "coach" ? (
          <CoachScreen
            status={status}
            onOpenCollection={() => switchTab("import")}
            onSave={handleSaveCoachDeck}
          />
        ) : null}

        {activeTab === "search" ? (
          <SearchScreen
            filtersCollapsed={filtersCollapsed}
            onCollapseFilters={() => setFiltersCollapsed(true)}
            onExpandFilters={() => setFiltersCollapsed(false)}
            onOpenDeckDrawer={() => setDeckDrawerOpen(true)}
            selectedDeckLabel={selectedDeckLabel}
            activeDeckTotalCards={activeDeckTotalCards}
            searchState={searchState}
            updateSearchFilters={updateSearchFilters}
            selectedSearchMechanics={selectedSearchMechanics}
            sidebarFavorites={sidebarFavorites}
            sidebarDerivedGroups={sidebarDerivedGroups}
            sidebarMechanicSelection={sidebarMechanicSelection}
            onToggleMechanic={toggleMechanic}
            onOpenGlossary={() => setGlossaryOpen(true)}
            cards={cards}
            cardsTotal={cardsTotal}
            searchLoading={searchLoading}
            visibleResultsCount={visibleResultsCount}
            onVisibleResultsCountChange={setVisibleResultsCount}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            exportLoading={searchExportLoading}
            onExportSearch={() => void handleExportSearch()}
            visibleCards={visibleCards}
            visibleSortedCards={visibleSortedCards}
            onClearDrilldown={() => setSearchState((current) => clearDrilldownState(current))}
            onToggleTableSort={toggleTableSort}
            onOpenCardDetail={(card) => void openCardDetail(card)}
            renderActions={renderActions}
          />
        ) : null}

        {activeTab === "stats" ? (
          <StatsScreen
            statsState={statsState}
            updateStatsFilters={updateStatsFilters}
            selectedStatsMechanics={selectedStatsMechanics}
            sidebarFavorites={sidebarFavorites}
            sidebarDerivedGroups={sidebarDerivedGroups}
            sidebarMechanicSelection={sidebarMechanicSelection}
            onToggleMechanic={toggleMechanic}
            onOpenGlossary={() => setGlossaryOpen(true)}
            cardStats={cardStats}
            statsLoading={statsLoading}
            onOpenStatsSearchView={handleOpenStatsSearchView}
            onOpenStatsDrilldown={handleOpenStatsDrilldown}
          />
        ) : null}

        {activeTab === "decks" ? (
          <DecksScreen
            deckList={deckList}
            activeDeck={activeDeck}
            deckName={deckName}
            deckFormat={deckFormat}
            onDeckNameChange={setDeckName}
            onDeckFormatChange={setDeckFormat}
            onCreateDeck={() => void handleCreateDeck()}
            onSelectDeck={(deckId) => void handleSelectDeck(deckId)}
            onSaveDeck={(deck) => void saveDeck(deck)}
            validation={validation}
            onRefreshValidation={async (deckId) => {
              setValidation(await validateDeck(deckId));
            }}
            exportText={exportText}
            deckSort={deckSort}
            deckGroup={deckGroup}
            onDeckSortChange={setDeckSort}
            onDeckGroupChange={setDeckGroup}
            sortedDeckDisplayCards={sortedDeckDisplayCards}
            deckCardGroups={deckCardGroups}
            onChangeDeckQuantity={(cardId, section, delta) => void handleChangeDeckQuantity(cardId, section, delta)}
            onActiveDeckChange={setActiveDeck}
            arenaDeckPreview={arenaDeckPreview}
            arenaDeckPreviewLoading={arenaDeckPreviewLoading}
            arenaDeckSyncing={arenaDeckSyncing}
            includeStarterDecks={includeStarterDecks}
            onIncludeStarterDecksChange={(value) => {
              setIncludeStarterDecks(value);
              setArenaDeckPreview(null);
            }}
            onPreviewArenaDecks={() => void handlePreviewArenaDecks()}
            onSyncArenaDecks={() => void handleSyncArenaDecks()}
            bulkExportLoading={bulkDeckExportLoading}
            bulkExportStatus={bulkDeckExportStatus}
            onCopyAllDecks={() => void handleCopyAllDecks()}
            onDownloadAllDecks={() => void handleDownloadAllDecks()}
          />
        ) : null}

        {activeTab === "import" ? (
          <ImportScreen
            status={status}
            importMessage={importMessage}
            errorMessage={errorMessage}
            formatDateTime={formatDateTime}
            formatFileSize={formatFileSize}
            csvFile={csvFile}
            csvPreview={csvPreview}
            csvPreviewLoading={csvPreviewLoading}
            csvImporting={csvImporting}
            onCsvPreview={(event) => void handleCsvPreview(event)}
            onConfirmCsvImport={(confirmSuspiciousDiff) =>
              void handleConfirmCsvImport(confirmSuspiciousDiff)
            }
            onClearCsvPreview={() => {
              setCsvFile(null);
              setCsvPreview(null);
              setImportMessage("");
            }}
            untappedCaptureSnippet={untappedHelperStatus?.snippet || UNTAPPED_CAPTURE_SNIPPET}
            untappedHelperStatus={untappedHelperStatus}
            untappedGuideActive={untappedGuideActive}
            untappedHelperLoading={untappedHelperLoading}
            untappedPreviewLoading={untappedPreviewLoading}
            untappedPreview={untappedPreview}
            untappedPreviewSource={untappedPreviewSource}
            untappedImporting={untappedImporting}
            untappedFile={untappedFile}
            onStartUntappedGuide={() => void handleStartUntappedGuide()}
            onCaptureUntappedCollection={() => void handleCaptureUntappedCollection()}
            onRestartUntappedCompanion={() => void handleRestartUntappedCompanion()}
            onCopyUntappedSnippet={() => void handleCopyUntappedSnippet()}
            onPreviewLatestUntappedCapture={() => void handlePreviewLatestUntappedCapture()}
            onStopUntappedGuide={() => void handleStopUntappedGuide()}
            onUntappedPreview={(event) => void handleUntappedPreview(event)}
            onConfirmUntappedImport={(confirmSuspiciousDiff) =>
              void handleConfirmUntappedImport(confirmSuspiciousDiff)
            }
            onClearUntappedPreview={() => {
              setUntappedFile(null);
              setUntappedPreview(null);
              setUntappedPreviewSource(null);
              setImportMessage("");
            }}
            collectorHelperStatus={collectorHelperStatus}
            collectorHelperLoading={collectorHelperLoading}
            collectorStatusRefreshing={collectorStatusRefreshing}
            collectorSnapshotPreviewLoading={collectorSnapshotPreviewLoading}
            collectorSnapshotImporting={collectorSnapshotImporting}
            collectorSnapshotPreview={collectorSnapshotPreview}
            collectorSnapshotError={collectorSnapshotError}
            collectorPreviewSource={collectorPreviewSource}
            collectorSnapshotFile={collectorSnapshotFile}
            onCaptureLatestCollectorSnapshot={() => void handleCaptureLatestCollectorSnapshot()}
            onRefreshCollectorStatus={() => void handleRefreshCollectorStatus()}
            onPreviewLatestCollectorSnapshot={() => void handlePreviewLatestCollectorSnapshot()}
            onCollectorSnapshotPreview={(event) => void handleCollectorSnapshotPreview(event)}
            onConfirmCollectorSnapshotImport={(confirmSuspiciousDiff) =>
              void handleConfirmCollectorSnapshotImport(confirmSuspiciousDiff)
            }
            onClearCollectorPreview={() => {
              setCollectorSnapshotFile(null);
              setCollectorSnapshotPreview(null);
              setCollectorPreviewSource(null);
              setCollectorSnapshotError("");
              setImportMessage("");
            }}
            importHistory={importHistory}
            importHistoryLoading={importHistoryLoading}
            restoringImportId={restoringImportId}
            onRestoreImport={(importId) => void handleRestoreCollectionImport(importId)}
          />
        ) : null}
      </main>

      {glossaryOpen ? (
        <div className="modal-shell" onClick={() => setGlossaryOpen(false)} role="presentation">
          <div
            className="modal-card glossary-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Mechanic glossary"
          >
            <div className="panel-header">
              <div>
                <h2>Mechanic Glossary</h2>
                <span>{glossaryItems.length} visible mechanics</span>
              </div>
              <button className="ghost-button subtle-button" onClick={() => setGlossaryOpen(false)} type="button">
                Close
              </button>
            </div>

            <label className="field">
              <span>Find a mechanic</span>
              <input
                value={glossaryQuery}
                onChange={(event) => setGlossaryQuery(event.target.value)}
                placeholder="Search names and definitions"
              />
            </label>

            <div className="glossary-list modal-glossary-list">
              {glossaryFavorites.length ? (
                <section className="glossary-group">
                  <h3>Pinned</h3>
                  {glossaryFavorites.map((mechanic) => {
                    const selected = searchState.mechanics.includes(mechanic.slug);
                    const pinned = favoriteSet.has(mechanic.slug);
                    return (
                      <article className={selected ? "glossary-item glossary-entry active" : "glossary-item glossary-entry"} key={`${mechanic.type}-${mechanic.slug}`}>
                        <div className="glossary-heading">
                          <strong>{mechanic.label}</strong>
                          <small>
                            {mechanic.type} · {mechanic.usageCount} cards
                          </small>
                        </div>
                        <p>{mechanic.definition}</p>
                        <div className="glossary-actions">
                          <button className={selected ? "chip active" : "chip"} onClick={() => toggleMechanic(mechanic.slug)} type="button">
                            {selected ? "Selected" : "Filter"}
                          </button>
                          <button className={pinned ? "chip active" : "chip"} onClick={() => toggleFavoriteMechanic(mechanic.slug)} type="button">
                            {pinned ? "Pinned" : "Pin"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ) : null}

              {glossaryDerivedGroups.map((section) => (
                <section className="glossary-group" key={`derived-${section.id}`}>
                  <h3>{section.label}</h3>
                  {section.items.map((mechanic) => {
                    const selected = searchState.mechanics.includes(mechanic.slug);
                    const pinned = favoriteSet.has(mechanic.slug);
                    return (
                      <article className={selected ? "glossary-item glossary-entry active" : "glossary-item glossary-entry"} key={`${mechanic.type}-${mechanic.slug}`}>
                        <div className="glossary-heading">
                          <strong>{mechanic.label}</strong>
                          <small>
                            {mechanic.type} · {mechanic.usageCount} cards
                          </small>
                        </div>
                        <p>{mechanic.definition}</p>
                        <div className="glossary-actions">
                          <button className={selected ? "chip active" : "chip"} onClick={() => toggleMechanic(mechanic.slug)} type="button">
                            {selected ? "Selected" : "Filter"}
                          </button>
                          <button className={pinned ? "chip active" : "chip"} onClick={() => toggleFavoriteMechanic(mechanic.slug)} type="button">
                            {pinned ? "Pinned" : "Pin"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              ))}

              <details
                className="keyword-details"
                open={keywordsExpanded || Boolean(glossaryQuery.trim())}
                onToggle={(event) => setKeywordsExpanded((event.currentTarget as HTMLDetailsElement).open)}
              >
                <summary>Official keywords ({glossaryKeywordGroups.reduce((count, group) => count + group.items.length, 0)})</summary>
                {glossaryKeywordGroups.map((section) => (
                  <section className="glossary-group" key={`keyword-${section.id}`}>
                    <h3>{section.label}</h3>
                    {section.items.map((mechanic) => {
                      const selected = searchState.mechanics.includes(mechanic.slug);
                      const pinned = favoriteSet.has(mechanic.slug);
                      return (
                        <article className={selected ? "glossary-item glossary-entry active" : "glossary-item glossary-entry"} key={`${mechanic.type}-${mechanic.slug}`}>
                          <div className="glossary-heading">
                            <strong>{mechanic.label}</strong>
                            <small>
                              {mechanic.type} · {mechanic.usageCount} cards
                            </small>
                          </div>
                          <p>{mechanic.definition}</p>
                          <div className="glossary-actions">
                            <button className={selected ? "chip active" : "chip"} onClick={() => toggleMechanic(mechanic.slug)} type="button">
                              {selected ? "Selected" : "Filter"}
                            </button>
                            <button className={pinned ? "chip active" : "chip"} onClick={() => toggleFavoriteMechanic(mechanic.slug)} type="button">
                              {pinned ? "Pinned" : "Pin"}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </section>
                ))}
              </details>
            </div>
          </div>
        </div>
      ) : null}

      {cardDetail || cardDetailLoading ? (
        <div
          className="modal-shell"
          onClick={() => {
            setCardDetail(null);
            setCardDetailLoading(false);
          }}
          role="presentation"
        >
          <div
            className="modal-card card-detail-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={cardDetail ? `${cardDetail.name} details` : "Card details"}
          >
            <div className="panel-header">
              <div>
                <h2>{cardDetail?.name ?? "Loading card..."}</h2>
                <span>{cardDetail ? `${cardDetail.typeLine} · ${formatOwnedCount(cardDetail)}` : "Fetching full card details"}</span>
              </div>
              <div className="card-detail-header-actions">
                {cardDetail ? (
                  <>
                    <a
                      className="ghost-button subtle-button button-link"
                      href={getUntappedSearchUrl(cardDetail.name)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Untapped
                    </a>
                    <div className="card-actions">{renderActions(cardDetail)}</div>
                  </>
                ) : null}
                <button
                  className="ghost-button subtle-button"
                  onClick={() => {
                    setCardDetail(null);
                    setCardDetailLoading(false);
                  }}
                  type="button"
                >
                  Close
                </button>
              </div>
            </div>

            {cardDetail ? (
              <div className="card-detail-layout">
                <section className="card-detail-primary">
                  <div className="card-detail-hero">
                    <ColorStrip colors={getCardAccentColors(cardDetail)} />
                    <div className="card-detail-hero-body">
                      <div className="card-detail-heading">
                        <div>
                          <h3>{cardDetail.name}</h3>
                          <p>{cardDetail.typeLine}</p>
                        </div>
                        <div className="card-corner">
                          <CardCornerVisual card={cardDetail} />
                          <OwnershipDots card={cardDetail} />
                        </div>
                      </div>
                      <div className="card-detail-meta">
                        <span>{cardDetail.preferredSetCode ?? "SET"}</span>
                        <span>{cardDetail.rarity}</span>
                        <span>MV {cardDetail.manaValue}</span>
                      </div>
                    </div>
                  </div>

                  <div className="subpanel">
                    <div className="panel-header">
                      <h3>Oracle Text</h3>
                    </div>
                    <p className="rules-text detail-rules-text">
                      <RenderOraclePreview text={cardDetail.oracleText} />
                    </p>
                  </div>

                  <div className="subpanel">
                    <div className="panel-header">
                      <h3>Mechanics</h3>
                      <span>{cardDetail.mechanics.length} tagged</span>
                    </div>
                    <div className="tag-row detail-tag-row">
                      {cardDetail.mechanics.length ? (
                        cardDetail.mechanics.map((mechanic) => (
                          <span className={`tag ${mechanic.type}`} key={`detail-${mechanic.slug}`} title={mechanic.definition}>
                            {mechanic.label}
                          </span>
                        ))
                      ) : (
                        <span className="empty-state">No indexed mechanics</span>
                      )}
                    </div>
                  </div>
                </section>

                <aside className="card-detail-secondary">
                  <div className="subpanel">
                    <div className="panel-header">
                      <h3>Legalities</h3>
                    </div>
                    <div className="detail-list">
                      {FORMATS.map(([value, label]) => (
                        <div className="detail-list-row" key={`legality-${value}`}>
                          <span>{label}</span>
                          <strong>{cardDetail.legalities[value] ?? "unknown"}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>
            ) : (
              <div className="subpanel">
                <p className="empty-state">Loading card details...</p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {deckDrawerOpen ? (
        <div className="drawer-shell" onClick={() => setDeckDrawerOpen(false)} role="presentation">
          <aside
            className="drawer-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Deck cart"
          >
            <div className="panel-header">
              <div>
                <h2>Deck Cart</h2>
                <span>
                  {activeDeck ? `${activeDeck.name} · ${getFormatLabel(activeDeck.format)}` : "No target deck selected"}
                </span>
              </div>
              <button className="ghost-button subtle-button" onClick={() => setDeckDrawerOpen(false)} type="button">
                Close
              </button>
            </div>

            <div className="drawer-target-row">
              <div className="target-menu-wrap">
                <button
                  className="target-deck-trigger"
                  onClick={() => setDeckTargetMenuOpen((current) => !current)}
                  type="button"
                >
                  <span className="deck-cart-icon" aria-hidden="true">
                    <span />
                    <span />
                  </span>
                  <span className="target-deck-trigger-label">{selectedDeckLabel}</span>
                  <span className="target-deck-caret">{deckTargetMenuOpen ? "▲" : "▼"}</span>
                </button>
                {deckTargetMenuOpen ? (
                  <div className="target-deck-menu" role="menu">
                    {deckList.map((deck) => (
                      <button
                        className={activeDeck?.id === deck.id ? "target-deck-option active" : "target-deck-option"}
                        key={`drawer-target-${deck.id}`}
                        onClick={() => void handleSelectDeckForPendingAdd(deck.id)}
                        type="button"
                      >
                        <span>{deck.name}</span>
                        <small>{deck.totalCards} cards</small>
                      </button>
                    ))}
                    <button
                      className="target-deck-option new-deck-option"
                      onClick={() => {
                        setDrawerCreateMode(true);
                        setDeckTargetMenuOpen(false);
                        setQuickDeckFormat(searchState.format as Deck["format"]);
                      }}
                      type="button"
                    >
                      + New deck...
                    </button>
                  </div>
                ) : null}
              </div>
              <small className="target-deck-meta">
                {pendingAdd
                  ? `Adding ${pendingAdd.card.name} after you choose a deck.`
                  : activeDeck
                    ? `${getFormatLabel(activeDeck.format)} · ${activeDeckTotalCards} cards`
                    : "Choose or create a target deck here."}
              </small>
            </div>

            {drawerCreateMode || (!activeDeck && deckList.length === 0) ? (
              <div className="subpanel quick-create-panel">
                <div className="panel-header">
                  <h3>Create a new target deck</h3>
                  <span>Quick create</span>
                </div>
                <div className="deck-creator quick-deck-creator">
                  <label className="field">
                    <span>Name</span>
                    <input value={quickDeckName} onChange={(event) => setQuickDeckName(event.target.value)} />
                  </label>
                  <label className="field">
                    <span>Format</span>
                    <select
                      value={quickDeckFormat}
                      onChange={(event) => setQuickDeckFormat(event.target.value as Deck["format"])}
                    >
                      {FORMATS.map(([value, label]) => (
                        <option key={`drawer-quick-${value}`} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="drawer-actions">
                    <button className="primary-button" onClick={() => void handleQuickCreateDeck()} type="button">
                      Create and use
                    </button>
                    {deckList.length ? (
                      <button
                        className="ghost-button subtle-button"
                        onClick={() => setDrawerCreateMode(false)}
                        type="button"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {activeDeck ? (
              <>
                <div className="drawer-summary-grid">
                  <div className="stat-card dense">
                    <span>Total</span>
                    <strong>{activeDeckTotalCards}</strong>
                  </div>
                  <div className="stat-card dense">
                    <span>Main</span>
                    <strong>{activeDeckSectionTotals.main}</strong>
                  </div>
                  <div className="stat-card dense">
                    <span>Side</span>
                    <strong>{activeDeckSectionTotals.sideboard}</strong>
                  </div>
                  <div className="stat-card dense">
                    <span>Cmdr</span>
                    <strong>{activeDeckSectionTotals.commander}</strong>
                  </div>
                </div>

                <div className="drawer-meta">
                  <span>{validation ? `${validation.issues.length} validation issue(s)` : "Validation not loaded yet"}</span>
                  <span>{validation ? `${validation.ownershipGaps.length} ownership gap(s)` : "Ownership gaps pending"}</span>
                </div>

                <div className="drawer-controls">
                  <DeckDisplayControls
                    compact
                    deckSort={deckSort}
                    deckGroup={deckGroup}
                    onDeckSortChange={setDeckSort}
                    onDeckGroupChange={setDeckGroup}
                  />
                  <div className="drawer-actions">
                    <button className="ghost-button subtle-button" onClick={handleOpenDeckDetails} type="button">
                      Open full deck
                    </button>
                    <button className="ghost-button subtle-button" onClick={() => void saveDeck(activeDeck)} type="button">
                      Save now
                    </button>
                  </div>
                </div>

                <div className="deck-card-list deck-cart-list">
                  {sortedDeckDisplayCards.length === 0 ? (
                    <p className="empty-state">Add cards from search and review them here as you build.</p>
                  ) : (
                    deckCardGroups.map((group) => (
                      <section className="deck-group" key={`drawer-group-${group.key}`}>
                        {deckGroup !== "none" ? (
                          <div className="deck-group-header">
                            <strong>{group.label}</strong>
                            <span>
                              {group.items.reduce((total, item) => total + item.quantity, 0)} cards
                            </span>
                          </div>
                        ) : null}
                        {group.items.map((deckCard) => (
                          <div className="deck-card-row cart-card-row" key={`drawer-${deckCard.cardId}-${deckCard.section}`}>
                            <div className="cart-card-copy">
                              <strong>{deckCard.displayName}</strong>
                              <p>
                                {deckCard.section}
                                {deckCard.displayTypeLine ? ` · ${deckCard.displayTypeLine}` : ""}
                                {deckCard.displayOwnedCount === null
                                  ? " · unlimited"
                                  : typeof deckCard.displayOwnedCount === "number"
                                    ? ` · own ${deckCard.displayOwnedCount}`
                                    : ""}
                              </p>
                            </div>
                            <div className="quantity-controls">
                              <button
                                onClick={() => void handleChangeDeckQuantity(deckCard.cardId, deckCard.section, -1)}
                                type="button"
                              >
                                -
                              </button>
                              <span>{deckCard.quantity}</span>
                              <button
                                onClick={() => void handleChangeDeckQuantity(deckCard.cardId, deckCard.section, 1)}
                                type="button"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </section>
                    ))
                  )}
                </div>
              </>
            ) : (
              <p className="empty-state">Choose a deck from the menu above, or create a new one here.</p>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

export default App;
