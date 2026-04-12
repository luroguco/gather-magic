import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState, startTransition } from "react";
import { CardCornerVisual, ColorStrip, getCardAccentColors, getMechanicSummary, OwnershipDots, RenderOraclePreview, trailingActionButtons } from "./cardPresentation";
import { capturePreviewCollectorSnapshot, createDeck, exportDeck, getCard, getCollectorHelperStatus, importCollectorSnapshot, getDeck, getMechanics, getStatus, importLatestCollectorSnapshot, getUntappedHelperStatus, importUntappedCollection, importLatestUntappedCapture, listDecks, previewLatestCollectorSnapshot, previewCollectorSnapshot, previewUntappedCollection, previewLatestUntappedCapture, startUntappedHelper, stopUntappedHelper, updateDeck, uploadCollection, validateDeck } from "./api";
import { DeckDisplayControls } from "./features/decks/DeckDisplayControls";
import { DecksScreen } from "./features/decks/DecksScreen";
import { ImportScreen } from "./features/import/ImportScreen";
import { useUntappedGuidePolling } from "./features/import/useUntappedGuidePolling";
import { SearchScreen } from "./features/search/SearchScreen";
import { useCardSearch } from "./features/search/useCardSearch";
import { CARD_TYPES, clearDrilldownState, defaultSearch, FORMATS, groupDerivedMechanics, groupKeywordMechanics, toggleValue } from "./features/shared/filterState";
import { useSyncedCardFilters } from "./features/shared/useSyncedCardFilters";
import { StatsScreen } from "./features/stats/StatsScreen";
import { useCardStats } from "./features/stats/useCardStats";
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
];
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
const mergeDeckCard = (cards, cardId, section) => {
    const existing = cards.find((card) => card.cardId === cardId && card.section === section);
    if (!existing) {
        return [...cards, { cardId, quantity: 1, section }];
    }
    return cards.map((card) => card.cardId === cardId && card.section === section
        ? { ...card, quantity: card.quantity + 1 }
        : card);
};
const formatDateTime = (value) => value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
const formatCatalogLabel = (preview) => {
    if (!preview) {
        return "Pending preview";
    }
    if (preview.catalogSource === "database") {
        return "Local catalog";
    }
    const buildLabel = preview.catalogMetadata?.build ? ` build ${preview.catalogMetadata.build}` : "";
    return `Untapped public${buildLabel}`;
};
const formatImportPreviewContext = (preview) => {
    const parts = [formatCatalogLabel(preview)];
    if (preview.snapshotMetadata?.capturedAt) {
        parts.push(`Captured ${formatDateTime(preview.snapshotMetadata.capturedAt)}`);
    }
    if (preview.snapshotMetadata?.collectorVersion) {
        parts.push(`Collector ${preview.snapshotMetadata.collectorVersion}`);
    }
    return parts.join(" · ");
};
const formatOwnedCount = (card) => {
    if (card.rawOwnedCount <= 0) {
        return "0 owned";
    }
    if (card.deckBuildingLimit === null || card.rawOwnedCount === card.ownedCount) {
        return `${card.rawOwnedCount} owned`;
    }
    return `${card.ownedCount} playable · ${card.rawOwnedCount} owned`;
};
const compareText = (left, right) => left.localeCompare(right);
const compareNumber = (left, right) => left - right;
const getFormatLabel = (format) => FORMATS.find(([value]) => value === format)?.[1] ?? format;
const truncateDeckName = (name, max = 16) => name.length <= max ? name : `${name.slice(0, Math.max(1, max - 3))}...`;
const getDeckTypeBucket = (typeLine) => CARD_TYPES.find((type) => typeLine.toLowerCase().includes(type.toLowerCase())) ?? "Other";
const getUntappedSearchUrl = (cardName) => `https://duckduckgo.com/?q=${encodeURIComponent(`site:mtga.untapped.gg/meta/cards "${cardName}"`)}`;
const formatFileSize = (size) => size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;
const getCollectorCaptureIdentity = (capture) => capture ? `${capture.path}::${capture.modifiedAt}` : null;
const getUntappedCaptureIdentity = (capture) => capture ? `${capture.path}::${capture.modifiedAt}` : null;
function App() {
    const [status, setStatus] = useState(null);
    const [mechanics, setMechanics] = useState([]);
    const { searchState, setSearchState, deferredSearchState, statsState, setStatsState, deferredStatsState, updateSearchFilters, updateStatsFilters, openStatsSearchView, openStatsDrilldown } = useSyncedCardFilters();
    const [deckList, setDeckList] = useState([]);
    const [activeDeck, setActiveDeck] = useState(null);
    const [validation, setValidation] = useState(null);
    const [exportText, setExportText] = useState("");
    const [activeTab, setActiveTab] = useState("search");
    const [deckName, setDeckName] = useState("New Arena Deck");
    const [deckFormat, setDeckFormat] = useState("standard");
    const [quickDeckName, setQuickDeckName] = useState("Search Deck");
    const [quickDeckFormat, setQuickDeckFormat] = useState("standard");
    const [importMessage, setImportMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [collectorSnapshotFile, setCollectorSnapshotFile] = useState(null);
    const [collectorSnapshotPreview, setCollectorSnapshotPreview] = useState(null);
    const [collectorSnapshotPreviewLoading, setCollectorSnapshotPreviewLoading] = useState(false);
    const [collectorSnapshotImporting, setCollectorSnapshotImporting] = useState(false);
    const [collectorHelperStatus, setCollectorHelperStatus] = useState(null);
    const [collectorHelperLoading, setCollectorHelperLoading] = useState(false);
    const [collectorPreviewSource, setCollectorPreviewSource] = useState(null);
    const [untappedFile, setUntappedFile] = useState(null);
    const [untappedPreview, setUntappedPreview] = useState(null);
    const [untappedPreviewLoading, setUntappedPreviewLoading] = useState(false);
    const [untappedImporting, setUntappedImporting] = useState(false);
    const [untappedHelperStatus, setUntappedHelperStatus] = useState(null);
    const [untappedHelperLoading, setUntappedHelperLoading] = useState(false);
    const [untappedGuideActive, setUntappedGuideActive] = useState(false);
    const [untappedPreviewSource, setUntappedPreviewSource] = useState(null);
    const [lastAutoPreviewedCaptureId, setLastAutoPreviewedCaptureId] = useState(null);
    const [glossaryOpen, setGlossaryOpen] = useState(false);
    const [glossaryQuery, setGlossaryQuery] = useState("");
    const [deckDrawerOpen, setDeckDrawerOpen] = useState(false);
    const [pendingAdd, setPendingAdd] = useState(null);
    const [filtersCollapsed, setFiltersCollapsed] = useState(false);
    const [deckTargetMenuOpen, setDeckTargetMenuOpen] = useState(false);
    const [drawerCreateMode, setDrawerCreateMode] = useState(false);
    const [cardDetail, setCardDetail] = useState(null);
    const [cardDetailLoading, setCardDetailLoading] = useState(false);
    const [deckSort, setDeckSort] = useState("added");
    const [deckGroup, setDeckGroup] = useState("section");
    const [theme, setTheme] = useState(() => {
        if (typeof window === "undefined") {
            return "forest";
        }
        const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
        return THEME_OPTIONS.some((option) => option.value === raw) ? raw : "forest";
    });
    const [favoriteMechanics, setFavoriteMechanics] = useState(() => {
        if (typeof window === "undefined") {
            return [];
        }
        try {
            const raw = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        }
        catch {
            return [];
        }
    });
    const [keywordsExpanded, setKeywordsExpanded] = useState(false);
    const [viewMode, setViewMode] = useState(() => {
        if (typeof window === "undefined") {
            return "grid";
        }
        const raw = window.localStorage.getItem(RESULT_VIEW_STORAGE_KEY);
        return raw === "list" || raw === "table" ? raw : "grid";
    });
    const [tableSort, setTableSort] = useState({
        key: "ownedCount",
        direction: "desc"
    });
    const searchScrollTopRef = useRef(0);
    const shouldRestoreSearchScrollRef = useRef(false);
    const cardDetailCacheRef = useRef({});
    const { cards, cardsTotal, visibleResultsCount, setVisibleResultsCount, searchLoading } = useCardSearch(deferredSearchState, (message) => setErrorMessage(message));
    const { cardStats, statsLoading } = useCardStats(deferredStatsState, (message) => setErrorMessage(message));
    const switchTab = (nextTab) => {
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
    const copyUntappedSnippetToClipboard = async (snippet) => {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
            return false;
        }
        try {
            await navigator.clipboard.writeText(snippet);
            return true;
        }
        catch {
            return false;
        }
    };
    const refreshCollectionViewsAfterImport = async () => {
        await loadStatus();
        startTransition(() => {
            setSearchState((current) => ({ ...current }));
            setStatsState((current) => ({ ...current }));
        });
    };
    const loadDecks = async (selectDeckId) => {
        const decks = await listDecks();
        setDeckList(decks);
        const targetDeckId = selectDeckId ?? activeDeck?.id ?? decks[0]?.id;
        if (targetDeckId) {
            const deck = await getDeck(targetDeckId);
            setActiveDeck(deck);
        }
        else {
            setActiveDeck(null);
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
            }
            catch (error) {
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
            }
            catch (error) {
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
        void Promise.all([refreshUntappedHelperStatus(), refreshCollectorHelperStatus()]).catch((error) => {
            setErrorMessage(error instanceof Error ? error.message : "Failed to load import helper status.");
        });
    }, [activeTab]);
    useUntappedGuidePolling({
        activeTab,
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
    const saveDeck = async (deck) => {
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
    const createAndSelectDeck = async (name, format) => {
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
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to create deck.");
        }
    };
    const handleSelectDeck = async (deckId) => {
        try {
            const deck = await getDeck(deckId);
            setActiveDeck(deck);
            setValidation(await validateDeck(deckId));
            setExportText((await exportDeck(deckId)).text);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to load deck.");
        }
    };
    const addCardToDeck = async (deck, card, section) => {
        const nextDeck = {
            ...deck,
            cards: mergeDeckCard(deck.cards, card.id, section)
        };
        setActiveDeck(nextDeck);
        await saveDeck(nextDeck);
    };
    const handleAddCard = async (card, section = "main") => {
        if (!activeDeck) {
            setPendingAdd({ card, section });
            setQuickDeckFormat(searchState.format);
            setDrawerCreateMode(false);
            setDeckTargetMenuOpen(true);
            setDeckDrawerOpen(true);
            setErrorMessage("");
            return;
        }
        try {
            await addCardToDeck(activeDeck, card, section);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to add card to deck.");
        }
    };
    const handleChangeDeckQuantity = async (cardId, section, delta) => {
        if (!activeDeck) {
            return;
        }
        const nextCards = activeDeck.cards
            .map((card) => card.cardId === cardId && card.section === section
            ? { ...card, quantity: card.quantity + delta }
            : card)
            .filter((card) => card.quantity > 0);
        const nextDeck = { ...activeDeck, cards: nextCards };
        setActiveDeck(nextDeck);
        try {
            await saveDeck(nextDeck);
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to update deck quantity.");
        }
    };
    const handleImport = async (event) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        try {
            const result = await uploadCollection(file);
            setImportMessage(`Imported ${result.ownedCopies} owned copies across ${result.cardsMatched} cards. ` +
                `${result.unresolvedRows.length} rows could not be matched.`);
            await refreshCollectionViewsAfterImport();
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Collection import failed.");
        }
    };
    const handleCollectorSnapshotPreview = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) {
            return;
        }
        try {
            setErrorMessage("");
            setImportMessage("");
            setCollectorSnapshotFile(file);
            setCollectorSnapshotPreview(null);
            setCollectorPreviewSource("manual-file");
            setCollectorSnapshotPreviewLoading(true);
            const preview = await previewCollectorSnapshot(file);
            setCollectorSnapshotPreview(preview);
        }
        catch (error) {
            setCollectorSnapshotFile(null);
            setCollectorSnapshotPreview(null);
            setCollectorPreviewSource(null);
            setErrorMessage(error instanceof Error ? error.message : "Collector snapshot preview failed.");
        }
        finally {
            setCollectorSnapshotPreviewLoading(false);
        }
    };
    const handleCaptureLatestCollectorSnapshot = async () => {
        try {
            setErrorMessage("");
            setImportMessage("");
            setCollectorHelperLoading(true);
            setCollectorSnapshotPreviewLoading(true);
            setCollectorSnapshotFile(null);
            setCollectorSnapshotPreview(null);
            setCollectorPreviewSource("latest-capture");
            const preview = await capturePreviewCollectorSnapshot();
            setCollectorSnapshotPreview(preview);
            setImportMessage(`Captured ${preview.capture.filename}. Review the preview and confirm import when ready.`);
            await refreshCollectorHelperStatus();
        }
        catch (error) {
            setCollectorPreviewSource(null);
            setErrorMessage(error instanceof Error ? error.message : "Failed to capture the live MTGA collection.");
        }
        finally {
            setCollectorHelperLoading(false);
            setCollectorSnapshotPreviewLoading(false);
        }
    };
    const handlePreviewLatestCollectorSnapshot = async () => {
        try {
            setErrorMessage("");
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
        }
        catch (error) {
            setCollectorPreviewSource(null);
            setErrorMessage(error instanceof Error ? error.message : "Failed to preview the latest collector snapshot.");
        }
        finally {
            setCollectorHelperLoading(false);
            setCollectorSnapshotPreviewLoading(false);
        }
    };
    const handleConfirmCollectorSnapshotImport = async () => {
        if (!collectorSnapshotFile && collectorPreviewSource !== "latest-capture") {
            return;
        }
        try {
            setErrorMessage("");
            setImportMessage("");
            setCollectorSnapshotImporting(true);
            let result;
            if (collectorPreviewSource === "latest-capture") {
                result = await importLatestCollectorSnapshot();
            }
            else if (collectorSnapshotFile) {
                result = await importCollectorSnapshot(collectorSnapshotFile);
            }
            else {
                throw new Error("Choose a collector snapshot JSON or refresh from MTGA before importing.");
            }
            setCollectorSnapshotPreview(result);
            setImportMessage(`Imported ${result.ownedCopies} playable copies across ${result.ownedTitles} titles from collector snapshot. ` +
                `${result.unresolvedCards.length} local matches unresolved, ${result.unmatchedGrpIds} grpIds unmatched.`);
            await refreshCollectionViewsAfterImport();
            await refreshCollectorHelperStatus();
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Collector snapshot import failed.");
        }
        finally {
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
            setImportMessage(copied
                ? "Untapped guided capture started. The DevTools snippet is in your clipboard."
                : "Untapped guided capture started. Clipboard copy failed, so paste the snippet shown below manually.");
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to start the Untapped guided capture.");
        }
        finally {
            setUntappedHelperLoading(false);
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
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to stop the Untapped guided capture.");
        }
        finally {
            setUntappedHelperLoading(false);
        }
    };
    const handleCopyUntappedSnippet = async () => {
        const snippet = untappedHelperStatus?.snippet ?? UNTAPPED_CAPTURE_SNIPPET;
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
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to preview the latest Untapped capture.");
        }
        finally {
            setUntappedPreviewLoading(false);
        }
    };
    const handleUntappedPreview = async (event) => {
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
        }
        catch (error) {
            setUntappedFile(null);
            setUntappedPreview(null);
            setUntappedPreviewSource(null);
            setErrorMessage(error instanceof Error ? error.message : "Untapped preview failed.");
        }
        finally {
            setUntappedPreviewLoading(false);
        }
    };
    const handleConfirmUntappedImport = async () => {
        if (!untappedPreviewSource) {
            return;
        }
        try {
            setErrorMessage("");
            setImportMessage("");
            setUntappedImporting(true);
            let result;
            if (untappedPreviewSource === "latest-capture") {
                const latestResult = await importLatestUntappedCapture();
                setLastAutoPreviewedCaptureId(getUntappedCaptureIdentity(latestResult.capture));
                result = latestResult;
            }
            else if (untappedFile) {
                result = await importUntappedCollection(untappedFile);
            }
            else {
                throw new Error("Choose an Untapped JSON file or preview the latest capture before importing.");
            }
            setUntappedPreview(result);
            setImportMessage(`Imported ${result.ownedCopies} playable copies across ${result.ownedTitles} titles from Untapped Companion. ` +
                `${result.unresolvedCards.length} local matches unresolved, ${result.unmatchedGrpIds} grpIds unmatched.`);
            await refreshCollectionViewsAfterImport();
            await refreshUntappedHelperStatus();
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Untapped import failed.");
        }
        finally {
            setUntappedImporting(false);
        }
    };
    const handleSelectDeckForPendingAdd = async (deckId) => {
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
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to select deck.");
        }
    };
    const handleQuickCreateDeck = async () => {
        try {
            const created = await createAndSelectDeck(quickDeckName, quickDeckFormat);
            setQuickDeckName("Search Deck");
            setQuickDeckFormat(searchState.format);
            setDeckTargetMenuOpen(false);
            setDrawerCreateMode(false);
            if (pendingAdd) {
                const nextPending = pendingAdd;
                setPendingAdd(null);
                await addCardToDeck(created, nextPending.card, nextPending.section);
                return;
            }
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to create deck.");
        }
    };
    const handleOpenDeckDetails = () => {
        setDeckDrawerOpen(false);
        switchTab("decks");
    };
    const deckCardsById = new Map(cards.map((card) => [card.id, card]));
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
        return (mechanic.label.toLowerCase().includes(query) ||
            mechanic.definition.toLowerCase().includes(query) ||
            mechanic.slug.toLowerCase().includes(query));
    });
    const favoriteSet = new Set(favoriteMechanics);
    const getSelectedMechanics = (state) => state.mechanics
        .map((slug) => sortedMechanics.find((mechanic) => mechanic.slug === slug))
        .filter((mechanic) => Boolean(mechanic));
    const selectedSearchMechanics = getSelectedMechanics(searchState);
    const selectedStatsMechanics = getSelectedMechanics(statsState);
    const sidebarMechanicSelection = activeTab === "stats" ? statsState.mechanics : searchState.mechanics;
    const sidebarFavorites = sortedMechanics.filter((mechanic) => favoriteSet.has(mechanic.slug));
    const sidebarDerivedGroups = groupDerivedMechanics(sortedMechanics.filter((mechanic) => mechanic.type === "derived" && !favoriteSet.has(mechanic.slug)));
    const glossaryFavorites = glossaryItems.filter((mechanic) => favoriteSet.has(mechanic.slug));
    const glossaryDerivedGroups = groupDerivedMechanics(glossaryItems.filter((mechanic) => mechanic.type === "derived" && !favoriteSet.has(mechanic.slug)));
    const glossaryKeywordGroups = groupKeywordMechanics(glossaryItems.filter((mechanic) => mechanic.type === "keyword" && !favoriteSet.has(mechanic.slug)));
    const toggleMechanic = (slug) => {
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
    const toggleFavoriteMechanic = (slug) => {
        setFavoriteMechanics((current) => toggleValue(current, slug));
    };
    const toggleTableSort = (key) => {
        setTableSort((current) => current.key === key
            ? {
                key,
                direction: current.direction === "asc" ? "desc" : "asc"
            }
            : {
                key,
                direction: key === "name" || key === "typeLine" || key === "set" || key === "rarity" || key === "mechanics" ? "asc" : "desc"
            });
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
    const activeDeckSectionTotals = activeDeckCards.reduce((totals, deckCard) => ({
        main: totals.main + (deckCard.section === "main" ? deckCard.quantity : 0),
        sideboard: totals.sideboard + (deckCard.section === "sideboard" ? deckCard.quantity : 0),
        commander: totals.commander + (deckCard.section === "commander" ? deckCard.quantity : 0)
    }), { main: 0, sideboard: 0, commander: 0 });
    const deckDisplayCards = activeDeckCards.map((deckCard, index) => {
        const card = deckCardsById.get(deckCard.cardId);
        return {
            ...deckCard,
            addedIndex: index,
            displayName: card?.name ?? deckCard.cardName ?? deckCard.cardId,
            displayTypeLine: card?.typeLine ?? deckCard.typeLine ?? "",
            displayManaCost: card?.manaCost ?? deckCard.manaCost ?? "",
            displayManaValue: card?.manaValue ?? deckCard.manaValue ?? 0,
            displayOwnedCount: deckCard.ownedCount ?? 0
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
        const grouped = new Map();
        const sectionOrder = { commander: 0, main: 1, sideboard: 2 };
        for (const deckCard of sortedDeckDisplayCards) {
            let key = "all";
            let label = "All cards";
            let orderValue = 0;
            if (deckGroup === "section") {
                key = deckCard.section;
                label = deckCard.section === "sideboard" ? "Sideboard" : deckCard.section === "commander" ? "Commander" : "Main deck";
                orderValue = sectionOrder[deckCard.section];
            }
            else if (deckGroup === "typeLine") {
                key = getDeckTypeBucket(deckCard.displayTypeLine);
                label = key;
                orderValue = key;
            }
            else if (deckGroup === "manaValue") {
                key = String(deckCard.displayManaValue);
                label = `MV ${deckCard.displayManaValue}`;
                orderValue = deckCard.displayManaValue;
            }
            const existing = grouped.get(key);
            if (existing) {
                existing.items.push(deckCard);
            }
            else {
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
    const renderActions = (card) => trailingActionButtons(card, showCommanderAction, handleAddCard);
    const openCardDetail = async (card) => {
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
        }
        catch (error) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to load card details.");
        }
        finally {
            setCardDetailLoading(false);
        }
    };
    const handleOpenStatsSearchView = () => {
        openStatsSearchView();
        switchTab("search");
    };
    const handleOpenStatsDrilldown = (drilldownKind, item) => {
        openStatsDrilldown(drilldownKind, item);
        switchTab("search");
    };
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { className: "app-header", children: [_jsxs("div", { className: "app-header-left", children: [_jsx("div", { className: "app-brand compact-brand", children: _jsx("h1", { children: "Collection Explorer" }) }), _jsx("nav", { className: "tab-strip app-tabs compact-tabs", children: [
                                    ["search", "Search"],
                                    ["stats", "Stats"],
                                    ["decks", "Decks"]
                                ].map(([tab, label]) => (_jsx("button", { className: activeTab === tab ? "tab-button active" : "tab-button", onClick: () => switchTab(tab), type: "button", children: label }, tab))) })] }), _jsxs("div", { className: "app-header-right", children: [_jsxs("details", { className: "header-menu", children: [_jsx("summary", { className: "header-menu-trigger", children: "Catalog" }), _jsxs("div", { className: "header-menu-panel stats-menu", children: [_jsxs("div", { className: "header-stat-row", children: [_jsx("span", { children: "Catalog" }), _jsx("strong", { children: status?.cards.total ?? 0 })] }), _jsxs("div", { className: "header-stat-row", children: [_jsx("span", { children: "Unique names" }), _jsx("strong", { children: status?.collection.uniqueNames ?? 0 })] }), _jsxs("div", { className: "header-stat-row", children: [_jsx("span", { children: "Owned copies" }), _jsx("strong", { children: status?.collection.ownedCopies ?? 0 })] }), _jsxs("div", { className: "header-stat-row", children: [_jsx("span", { children: "Owned rows" }), _jsx("strong", { children: status?.collection.importRowsWithCopies ?? 0 })] })] })] }), _jsxs("details", { className: "header-menu", children: [_jsxs("summary", { className: "header-menu-trigger", children: [_jsx("span", { className: `scheme-tone ${activeTheme.tone}`, "aria-hidden": "true" }), _jsx("span", { children: activeTheme.label })] }), _jsxs("div", { className: "header-menu-panel theme-menu", children: [_jsxs("div", { className: "theme-menu-group", children: [_jsx("span", { className: "theme-menu-heading", children: "Dark" }), darkThemes.map((option) => (_jsxs("button", { className: theme === option.value ? "theme-menu-item active" : "theme-menu-item", onClick: () => setTheme(option.value), type: "button", children: [_jsx("span", { className: `scheme-tone ${option.tone}`, "aria-hidden": "true" }), _jsx("span", { children: option.label }), _jsx("small", { children: option.tone })] }, option.value)))] }), _jsxs("div", { className: "theme-menu-group", children: [_jsx("span", { className: "theme-menu-heading", children: "Light" }), lightThemes.map((option) => (_jsxs("button", { className: theme === option.value ? "theme-menu-item active" : "theme-menu-item", onClick: () => setTheme(option.value), type: "button", children: [_jsx("span", { className: `scheme-tone ${option.tone}`, "aria-hidden": "true" }), _jsx("span", { children: option.label }), _jsx("small", { children: option.tone })] }, option.value)))] })] })] }), _jsx("button", { className: activeTab === "import" ? "tab-button active" : "tab-button", onClick: () => switchTab("import"), type: "button", children: "Import" })] })] }), errorMessage ? _jsx("div", { className: "banner error", children: errorMessage }) : null, importMessage ? _jsx("div", { className: "banner success", children: importMessage }) : null, status && status.cards.total === 0 ? (_jsxs("div", { className: "banner warning", children: ["No Arena catalog is loaded yet. Run ", _jsx("code", { children: "npm run db:sync" }), " from the project root, then refresh the app."] })) : null, _jsxs("main", { className: activeTab === "search" || activeTab === "stats" ? "app-main search-main" : "app-main", children: [activeTab === "search" ? (_jsx(SearchScreen, { filtersCollapsed: filtersCollapsed, onCollapseFilters: () => setFiltersCollapsed(true), onExpandFilters: () => setFiltersCollapsed(false), onOpenDeckDrawer: () => setDeckDrawerOpen(true), selectedDeckLabel: selectedDeckLabel, activeDeckTotalCards: activeDeckTotalCards, searchState: searchState, updateSearchFilters: updateSearchFilters, selectedSearchMechanics: selectedSearchMechanics, sidebarFavorites: sidebarFavorites, sidebarDerivedGroups: sidebarDerivedGroups, sidebarMechanicSelection: sidebarMechanicSelection, onToggleMechanic: toggleMechanic, onOpenGlossary: () => setGlossaryOpen(true), cards: cards, cardsTotal: cardsTotal, searchLoading: searchLoading, visibleResultsCount: visibleResultsCount, onVisibleResultsCountChange: setVisibleResultsCount, viewMode: viewMode, onViewModeChange: setViewMode, visibleCards: visibleCards, visibleSortedCards: visibleSortedCards, onClearDrilldown: () => setSearchState((current) => clearDrilldownState(current)), onToggleTableSort: toggleTableSort, onOpenCardDetail: (card) => void openCardDetail(card), renderActions: renderActions })) : null, activeTab === "stats" ? (_jsx(StatsScreen, { statsState: statsState, updateStatsFilters: updateStatsFilters, selectedStatsMechanics: selectedStatsMechanics, sidebarFavorites: sidebarFavorites, sidebarDerivedGroups: sidebarDerivedGroups, sidebarMechanicSelection: sidebarMechanicSelection, onToggleMechanic: toggleMechanic, onOpenGlossary: () => setGlossaryOpen(true), cardStats: cardStats, statsLoading: statsLoading, onOpenStatsSearchView: handleOpenStatsSearchView, onOpenStatsDrilldown: handleOpenStatsDrilldown })) : null, activeTab === "decks" ? (_jsx(DecksScreen, { deckList: deckList, activeDeck: activeDeck, deckName: deckName, deckFormat: deckFormat, onDeckNameChange: setDeckName, onDeckFormatChange: setDeckFormat, onCreateDeck: () => void handleCreateDeck(), onSelectDeck: (deckId) => void handleSelectDeck(deckId), onSaveDeck: (deck) => void saveDeck(deck), validation: validation, onRefreshValidation: async (deckId) => {
                            setValidation(await validateDeck(deckId));
                        }, onRefreshExport: async (deckId) => {
                            const arenaExport = await exportDeck(deckId);
                            setExportText(arenaExport.text);
                        }, exportText: exportText, deckSort: deckSort, deckGroup: deckGroup, onDeckSortChange: setDeckSort, onDeckGroupChange: setDeckGroup, sortedDeckDisplayCards: sortedDeckDisplayCards, deckCardGroups: deckCardGroups, onChangeDeckQuantity: (cardId, section, delta) => void handleChangeDeckQuantity(cardId, section, delta), onActiveDeckChange: setActiveDeck })) : null, activeTab === "import" ? (_jsx(ImportScreen, { status: status, formatDateTime: formatDateTime, formatFileSize: formatFileSize, untappedCaptureSnippet: untappedHelperStatus?.snippet ?? UNTAPPED_CAPTURE_SNIPPET, untappedHelperStatus: untappedHelperStatus, untappedGuideActive: untappedGuideActive, untappedHelperLoading: untappedHelperLoading, untappedPreviewLoading: untappedPreviewLoading, untappedPreview: untappedPreview, untappedPreviewSource: untappedPreviewSource, untappedImporting: untappedImporting, untappedFile: untappedFile, onStartUntappedGuide: () => void handleStartUntappedGuide(), onCopyUntappedSnippet: () => void handleCopyUntappedSnippet(), onPreviewLatestUntappedCapture: () => void handlePreviewLatestUntappedCapture(), onStopUntappedGuide: () => void handleStopUntappedGuide(), onUntappedPreview: (event) => void handleUntappedPreview(event), onConfirmUntappedImport: () => void handleConfirmUntappedImport(), collectorHelperStatus: collectorHelperStatus, collectorHelperLoading: collectorHelperLoading, collectorSnapshotPreviewLoading: collectorSnapshotPreviewLoading, collectorSnapshotImporting: collectorSnapshotImporting, collectorSnapshotPreview: collectorSnapshotPreview, collectorPreviewSource: collectorPreviewSource, collectorSnapshotFile: collectorSnapshotFile, onCaptureLatestCollectorSnapshot: () => void handleCaptureLatestCollectorSnapshot(), onPreviewLatestCollectorSnapshot: () => void handlePreviewLatestCollectorSnapshot(), onCollectorSnapshotPreview: (event) => void handleCollectorSnapshotPreview(event), onConfirmCollectorSnapshotImport: () => void handleConfirmCollectorSnapshotImport(), onImportCsv: (event) => void handleImport(event), formatImportPreviewContext: formatImportPreviewContext })) : null] }), glossaryOpen ? (_jsx("div", { className: "modal-shell", onClick: () => setGlossaryOpen(false), role: "presentation", children: _jsxs("div", { className: "modal-card glossary-modal", onClick: (event) => event.stopPropagation(), role: "dialog", "aria-modal": "true", "aria-label": "Mechanic glossary", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Mechanic Glossary" }), _jsxs("span", { children: [glossaryItems.length, " visible mechanics"] })] }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => setGlossaryOpen(false), type: "button", children: "Close" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Find a mechanic" }), _jsx("input", { value: glossaryQuery, onChange: (event) => setGlossaryQuery(event.target.value), placeholder: "Search names and definitions" })] }), _jsxs("div", { className: "glossary-list modal-glossary-list", children: [glossaryFavorites.length ? (_jsxs("section", { className: "glossary-group", children: [_jsx("h3", { children: "Pinned" }), glossaryFavorites.map((mechanic) => {
                                            const selected = searchState.mechanics.includes(mechanic.slug);
                                            const pinned = favoriteSet.has(mechanic.slug);
                                            return (_jsxs("article", { className: selected ? "glossary-item glossary-entry active" : "glossary-item glossary-entry", children: [_jsxs("div", { className: "glossary-heading", children: [_jsx("strong", { children: mechanic.label }), _jsxs("small", { children: [mechanic.type, " \u00B7 ", mechanic.usageCount, " cards"] })] }), _jsx("p", { children: mechanic.definition }), _jsxs("div", { className: "glossary-actions", children: [_jsx("button", { className: selected ? "chip active" : "chip", onClick: () => toggleMechanic(mechanic.slug), type: "button", children: selected ? "Selected" : "Filter" }), _jsx("button", { className: pinned ? "chip active" : "chip", onClick: () => toggleFavoriteMechanic(mechanic.slug), type: "button", children: pinned ? "Pinned" : "Pin" })] })] }, `${mechanic.type}-${mechanic.slug}`));
                                        })] })) : null, glossaryDerivedGroups.map((section) => (_jsxs("section", { className: "glossary-group", children: [_jsx("h3", { children: section.label }), section.items.map((mechanic) => {
                                            const selected = searchState.mechanics.includes(mechanic.slug);
                                            const pinned = favoriteSet.has(mechanic.slug);
                                            return (_jsxs("article", { className: selected ? "glossary-item glossary-entry active" : "glossary-item glossary-entry", children: [_jsxs("div", { className: "glossary-heading", children: [_jsx("strong", { children: mechanic.label }), _jsxs("small", { children: [mechanic.type, " \u00B7 ", mechanic.usageCount, " cards"] })] }), _jsx("p", { children: mechanic.definition }), _jsxs("div", { className: "glossary-actions", children: [_jsx("button", { className: selected ? "chip active" : "chip", onClick: () => toggleMechanic(mechanic.slug), type: "button", children: selected ? "Selected" : "Filter" }), _jsx("button", { className: pinned ? "chip active" : "chip", onClick: () => toggleFavoriteMechanic(mechanic.slug), type: "button", children: pinned ? "Pinned" : "Pin" })] })] }, `${mechanic.type}-${mechanic.slug}`));
                                        })] }, `derived-${section.id}`))), _jsxs("details", { className: "keyword-details", open: keywordsExpanded || Boolean(glossaryQuery.trim()), onToggle: (event) => setKeywordsExpanded(event.currentTarget.open), children: [_jsxs("summary", { children: ["Official keywords (", glossaryKeywordGroups.reduce((count, group) => count + group.items.length, 0), ")"] }), glossaryKeywordGroups.map((section) => (_jsxs("section", { className: "glossary-group", children: [_jsx("h3", { children: section.label }), section.items.map((mechanic) => {
                                                    const selected = searchState.mechanics.includes(mechanic.slug);
                                                    const pinned = favoriteSet.has(mechanic.slug);
                                                    return (_jsxs("article", { className: selected ? "glossary-item glossary-entry active" : "glossary-item glossary-entry", children: [_jsxs("div", { className: "glossary-heading", children: [_jsx("strong", { children: mechanic.label }), _jsxs("small", { children: [mechanic.type, " \u00B7 ", mechanic.usageCount, " cards"] })] }), _jsx("p", { children: mechanic.definition }), _jsxs("div", { className: "glossary-actions", children: [_jsx("button", { className: selected ? "chip active" : "chip", onClick: () => toggleMechanic(mechanic.slug), type: "button", children: selected ? "Selected" : "Filter" }), _jsx("button", { className: pinned ? "chip active" : "chip", onClick: () => toggleFavoriteMechanic(mechanic.slug), type: "button", children: pinned ? "Pinned" : "Pin" })] })] }, `${mechanic.type}-${mechanic.slug}`));
                                                })] }, `keyword-${section.id}`)))] })] })] }) })) : null, cardDetail || cardDetailLoading ? (_jsx("div", { className: "modal-shell", onClick: () => {
                    setCardDetail(null);
                    setCardDetailLoading(false);
                }, role: "presentation", children: _jsxs("div", { className: "modal-card card-detail-modal", onClick: (event) => event.stopPropagation(), role: "dialog", "aria-modal": "true", "aria-label": cardDetail ? `${cardDetail.name} details` : "Card details", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: cardDetail?.name ?? "Loading card..." }), _jsx("span", { children: cardDetail ? `${cardDetail.typeLine} · ${formatOwnedCount(cardDetail)}` : "Fetching full card details" })] }), _jsxs("div", { className: "card-detail-header-actions", children: [cardDetail ? (_jsxs(_Fragment, { children: [_jsx("a", { className: "ghost-button subtle-button button-link", href: getUntappedSearchUrl(cardDetail.name), rel: "noreferrer", target: "_blank", children: "Untapped" }), _jsx("div", { className: "card-actions", children: renderActions(cardDetail) })] })) : null, _jsx("button", { className: "ghost-button subtle-button", onClick: () => {
                                                setCardDetail(null);
                                                setCardDetailLoading(false);
                                            }, type: "button", children: "Close" })] })] }), cardDetail ? (_jsxs("div", { className: "card-detail-layout", children: [_jsxs("section", { className: "card-detail-primary", children: [_jsxs("div", { className: "card-detail-hero", children: [_jsx(ColorStrip, { colors: getCardAccentColors(cardDetail) }), _jsxs("div", { className: "card-detail-hero-body", children: [_jsxs("div", { className: "card-detail-heading", children: [_jsxs("div", { children: [_jsx("h3", { children: cardDetail.name }), _jsx("p", { children: cardDetail.typeLine })] }), _jsxs("div", { className: "card-corner", children: [_jsx(CardCornerVisual, { card: cardDetail }), _jsx(OwnershipDots, { card: cardDetail })] })] }), _jsxs("div", { className: "card-detail-meta", children: [_jsx("span", { children: cardDetail.preferredSetCode ?? "SET" }), _jsx("span", { children: cardDetail.rarity }), _jsxs("span", { children: ["MV ", cardDetail.manaValue] })] })] })] }), _jsxs("div", { className: "subpanel", children: [_jsx("div", { className: "panel-header", children: _jsx("h3", { children: "Oracle Text" }) }), _jsx("p", { className: "rules-text detail-rules-text", children: _jsx(RenderOraclePreview, { text: cardDetail.oracleText }) })] }), _jsxs("div", { className: "subpanel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Mechanics" }), _jsxs("span", { children: [cardDetail.mechanics.length, " tagged"] })] }), _jsx("div", { className: "tag-row detail-tag-row", children: cardDetail.mechanics.length ? (cardDetail.mechanics.map((mechanic) => (_jsx("span", { className: `tag ${mechanic.type}`, title: mechanic.definition, children: mechanic.label }, `detail-${mechanic.slug}`)))) : (_jsx("span", { className: "empty-state", children: "No indexed mechanics" })) })] })] }), _jsx("aside", { className: "card-detail-secondary", children: _jsxs("div", { className: "subpanel", children: [_jsx("div", { className: "panel-header", children: _jsx("h3", { children: "Legalities" }) }), _jsx("div", { className: "detail-list", children: FORMATS.map(([value, label]) => (_jsxs("div", { className: "detail-list-row", children: [_jsx("span", { children: label }), _jsx("strong", { children: cardDetail.legalities[value] ?? "unknown" })] }, `legality-${value}`))) })] }) })] })) : (_jsx("div", { className: "subpanel", children: _jsx("p", { className: "empty-state", children: "Loading card details..." }) }))] }) })) : null, deckDrawerOpen ? (_jsx("div", { className: "drawer-shell", onClick: () => setDeckDrawerOpen(false), role: "presentation", children: _jsxs("aside", { className: "drawer-panel", onClick: (event) => event.stopPropagation(), role: "dialog", "aria-modal": "true", "aria-label": "Deck cart", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Deck Cart" }), _jsx("span", { children: activeDeck ? `${activeDeck.name} · ${getFormatLabel(activeDeck.format)}` : "No target deck selected" })] }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => setDeckDrawerOpen(false), type: "button", children: "Close" })] }), _jsxs("div", { className: "drawer-target-row", children: [_jsxs("div", { className: "target-menu-wrap", children: [_jsxs("button", { className: "target-deck-trigger", onClick: () => setDeckTargetMenuOpen((current) => !current), type: "button", children: [_jsxs("span", { className: "deck-cart-icon", "aria-hidden": "true", children: [_jsx("span", {}), _jsx("span", {})] }), _jsx("span", { className: "target-deck-trigger-label", children: selectedDeckLabel }), _jsx("span", { className: "target-deck-caret", children: deckTargetMenuOpen ? "▲" : "▼" })] }), deckTargetMenuOpen ? (_jsxs("div", { className: "target-deck-menu", role: "menu", children: [deckList.map((deck) => (_jsxs("button", { className: activeDeck?.id === deck.id ? "target-deck-option active" : "target-deck-option", onClick: () => void handleSelectDeckForPendingAdd(deck.id), type: "button", children: [_jsx("span", { children: deck.name }), _jsxs("small", { children: [deck.totalCards, " cards"] })] }, `drawer-target-${deck.id}`))), _jsx("button", { className: "target-deck-option new-deck-option", onClick: () => {
                                                        setDrawerCreateMode(true);
                                                        setDeckTargetMenuOpen(false);
                                                        setQuickDeckFormat(searchState.format);
                                                    }, type: "button", children: "+ New deck..." })] })) : null] }), _jsx("small", { className: "target-deck-meta", children: pendingAdd
                                        ? `Adding ${pendingAdd.card.name} after you choose a deck.`
                                        : activeDeck
                                            ? `${getFormatLabel(activeDeck.format)} · ${activeDeckTotalCards} cards`
                                            : "Choose or create a target deck here." })] }), drawerCreateMode || (!activeDeck && deckList.length === 0) ? (_jsxs("div", { className: "subpanel quick-create-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Create a new target deck" }), _jsx("span", { children: "Quick create" })] }), _jsxs("div", { className: "deck-creator quick-deck-creator", children: [_jsxs("label", { className: "field", children: [_jsx("span", { children: "Name" }), _jsx("input", { value: quickDeckName, onChange: (event) => setQuickDeckName(event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Format" }), _jsx("select", { value: quickDeckFormat, onChange: (event) => setQuickDeckFormat(event.target.value), children: FORMATS.map(([value, label]) => (_jsx("option", { value: value, children: label }, `drawer-quick-${value}`))) })] }), _jsxs("div", { className: "drawer-actions", children: [_jsx("button", { className: "primary-button", onClick: () => void handleQuickCreateDeck(), type: "button", children: "Create and use" }), deckList.length ? (_jsx("button", { className: "ghost-button subtle-button", onClick: () => setDrawerCreateMode(false), type: "button", children: "Cancel" })) : null] })] })] })) : null, activeDeck ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "drawer-summary-grid", children: [_jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Total" }), _jsx("strong", { children: activeDeckTotalCards })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Main" }), _jsx("strong", { children: activeDeckSectionTotals.main })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Side" }), _jsx("strong", { children: activeDeckSectionTotals.sideboard })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Cmdr" }), _jsx("strong", { children: activeDeckSectionTotals.commander })] })] }), _jsxs("div", { className: "drawer-meta", children: [_jsx("span", { children: validation ? `${validation.issues.length} validation issue(s)` : "Validation not loaded yet" }), _jsx("span", { children: validation ? `${validation.ownershipGaps.length} ownership gap(s)` : "Ownership gaps pending" })] }), _jsxs("div", { className: "drawer-controls", children: [_jsx(DeckDisplayControls, { compact: true, deckSort: deckSort, deckGroup: deckGroup, onDeckSortChange: setDeckSort, onDeckGroupChange: setDeckGroup }), _jsxs("div", { className: "drawer-actions", children: [_jsx("button", { className: "ghost-button subtle-button", onClick: handleOpenDeckDetails, type: "button", children: "Open full deck" }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => void saveDeck(activeDeck), type: "button", children: "Save now" })] })] }), _jsx("div", { className: "deck-card-list deck-cart-list", children: sortedDeckDisplayCards.length === 0 ? (_jsx("p", { className: "empty-state", children: "Add cards from search and review them here as you build." })) : (deckCardGroups.map((group) => (_jsxs("section", { className: "deck-group", children: [deckGroup !== "none" ? (_jsxs("div", { className: "deck-group-header", children: [_jsx("strong", { children: group.label }), _jsxs("span", { children: [group.items.reduce((total, item) => total + item.quantity, 0), " cards"] })] })) : null, group.items.map((deckCard) => (_jsxs("div", { className: "deck-card-row cart-card-row", children: [_jsxs("div", { className: "cart-card-copy", children: [_jsx("strong", { children: deckCard.displayName }), _jsxs("p", { children: [deckCard.section, deckCard.displayTypeLine ? ` · ${deckCard.displayTypeLine}` : "", typeof deckCard.displayOwnedCount === "number" ? ` · own ${deckCard.displayOwnedCount}` : ""] })] }), _jsxs("div", { className: "quantity-controls", children: [_jsx("button", { onClick: () => void handleChangeDeckQuantity(deckCard.cardId, deckCard.section, -1), type: "button", children: "-" }), _jsx("span", { children: deckCard.quantity }), _jsx("button", { onClick: () => void handleChangeDeckQuantity(deckCard.cardId, deckCard.section, 1), type: "button", children: "+" })] })] }, `drawer-${deckCard.cardId}-${deckCard.section}`)))] }, `drawer-group-${group.key}`)))) })] })) : (_jsx("p", { className: "empty-state", children: "Choose a deck from the menu above, or create a new one here." }))] }) })) : null] }));
}
export default App;
