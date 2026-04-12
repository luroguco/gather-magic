import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useDeferredValue, useEffect, useRef, useState, startTransition } from "react";
import { CardCornerVisual, CardMetaSummary, ColorStrip, getCardAccentColors, getMechanicSummary, OwnershipDots, RenderOraclePreview, trailingActionButtons, VerticalColorStrip } from "./cardPresentation";
import { capturePreviewCollectorSnapshot, createDeck, exportDeck, getCard, getCardStats, getCollectorHelperStatus, importCollectorSnapshot, getDeck, getMechanics, getStatus, importLatestCollectorSnapshot, getUntappedHelperStatus, importUntappedCollection, importLatestUntappedCapture, listDecks, previewLatestCollectorSnapshot, previewCollectorSnapshot, previewUntappedCollection, previewLatestUntappedCapture, startUntappedHelper, stopUntappedHelper, searchCards, updateDeck, uploadCollection, validateDeck } from "./api";
const FORMATS = [
    ["standard", "Standard"],
    ["alchemy", "Alchemy"],
    ["explorer", "Explorer"],
    ["historic", "Historic"],
    ["timeless", "Timeless"],
    ["brawl", "Brawl"],
    ["standardbrawl", "Standard Brawl"]
];
const COLORS = ["W", "U", "B", "R", "G"];
const CARD_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land"];
const RARITIES = ["common", "uncommon", "rare", "mythic"];
const defaultFilterState = {
    q: "",
    format: "standard",
    colors: [],
    mechanics: [],
    types: [],
    subtypes: "",
    rarity: [],
    playableCountMin: "",
    playableCountMax: "",
    manaValueMin: "",
    manaValueMax: ""
};
const defaultSearch = {
    ...defaultFilterState,
    ownedOnly: false,
    drilldownKind: "",
    drilldownKey: "",
    drilldownLabel: ""
};
const defaultStatsFilters = {
    ...defaultFilterState,
    ownedOnly: true,
    drilldownKind: "",
    drilldownKey: "",
    drilldownLabel: ""
};
const FAVORITES_STORAGE_KEY = "mtga.favorite-mechanics";
const RESULT_VIEW_STORAGE_KEY = "mtga.search-results-view";
const THEME_STORAGE_KEY = "mtga.app-theme";
const SEARCH_PAGE_SIZE = 50_000;
const INITIAL_VISIBLE_RESULTS = 120;
const VISIBLE_RESULTS_STEP = 120;
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
const derivedBucketLabels = {
    advantage: "Card Advantage",
    removal: "Removal",
    graveyard: "Graveyard",
    tokens: "Tokens and Counters",
    mana: "Mana and Ramp",
    synergy: "Synergy",
    combat: "Combat"
};
const derivedBucketOrder = ["advantage", "removal", "graveyard", "tokens", "mana", "synergy", "combat"];
const keywordBucketLabels = {
    evasion: "Combat and Evasion",
    defense: "Defense and Protection",
    casting: "Casting and Timing",
    resources: "Resources and Objects",
    library: "Library and Graveyard",
    transformation: "Transform and Alternate Casting",
    misc: "Other Keywords"
};
const keywordBucketOrder = ["evasion", "defense", "casting", "resources", "library", "transformation", "misc"];
const toggleValue = (values, value) => values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
const getDerivedBucketId = (slug) => {
    if (["card-draw", "enter-the-battlefield"].includes(slug)) {
        return "advantage";
    }
    if (["spot-removal", "board-wipe", "counterspell", "burn"].includes(slug)) {
        return "removal";
    }
    if (["self-mill", "discard", "discard-payoff", "graveyard-recursion", "reanimation", "graveyard-hate", "death-triggers"].includes(slug)) {
        return "graveyard";
    }
    if (["token-creation", "token-payoff", "counters-plus-one"].includes(slug)) {
        return "tokens";
    }
    if (["ramp", "landfall"].includes(slug)) {
        return "mana";
    }
    if (["sacrifice", "blink", "artifact-matters", "enchantment-matters", "lifegain", "lifegain-payoff", "spellslinger"].includes(slug)) {
        return "synergy";
    }
    return "combat";
};
const getKeywordBucketId = (slug) => {
    if (["flying", "trample", "menace", "reach", "first-strike", "double-strike", "deathtouch", "lifelink", "haste", "vigilance"].includes(slug)) {
        return "evasion";
    }
    if (["ward", "hexproof", "indestructible", "protection", "defender"].includes(slug)) {
        return "defense";
    }
    if (["flash", "kicker", "convoke", "spree", "bargain", "casualty", "gift", "equip", "enchant"].includes(slug)) {
        return "casting";
    }
    if (["treasure", "cycling", "landwalk", "domain"].includes(slug)) {
        return "resources";
    }
    if (["scry", "surveil", "mill", "flashback", "unearth", "morph", "discover"].includes(slug)) {
        return "library";
    }
    if (["transform", "foretell", "plot", "disturb", "disguise", "daybound", "nightbound"].includes(slug)) {
        return "transformation";
    }
    return "misc";
};
const groupMechanics = (items, bucketFor, labels, order) => {
    const grouped = new Map();
    for (const item of items) {
        const bucketId = bucketFor(item.slug);
        const bucketItems = grouped.get(bucketId) ?? [];
        bucketItems.push(item);
        grouped.set(bucketId, bucketItems);
    }
    const sections = order
        .map((bucketId) => ({
        id: bucketId,
        label: labels[bucketId] ?? bucketId,
        items: grouped.get(bucketId) ?? []
    }))
        .filter((section) => section.items.length > 0);
    for (const [bucketId, bucketItems] of grouped.entries()) {
        if (order.includes(bucketId)) {
            continue;
        }
        sections.push({
            id: bucketId,
            label: labels[bucketId] ?? bucketId,
            items: bucketItems
        });
    }
    return sections;
};
const buildSearchParams = (state) => {
    const params = new URLSearchParams();
    if (state.q.trim()) {
        params.set("q", state.q.trim());
    }
    if (state.format) {
        params.set("format", state.format);
    }
    if (state.colors.length) {
        params.set("colors", state.colors.join(","));
    }
    if (state.mechanics.length) {
        params.set("mechanics", state.mechanics.join(","));
    }
    if (state.types.length) {
        params.set("types", state.types.join(","));
    }
    if (state.subtypes.trim()) {
        params.set("subtypes", state.subtypes
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
            .join(","));
    }
    if (state.rarity.length) {
        params.set("rarity", state.rarity.join(","));
    }
    if (state.ownedOnly) {
        params.set("ownedOnly", "true");
    }
    if (state.playableCountMin) {
        params.set("playableCountMin", state.playableCountMin);
    }
    if (state.playableCountMax) {
        params.set("playableCountMax", state.playableCountMax);
    }
    if (state.manaValueMin) {
        params.set("manaValueMin", state.manaValueMin);
    }
    if (state.manaValueMax) {
        params.set("manaValueMax", state.manaValueMax);
    }
    if (state.drilldownKind && state.drilldownKey) {
        params.set("drilldownKind", state.drilldownKind);
        params.set("drilldownKey", state.drilldownKey);
    }
    params.set("page", "1");
    params.set("pageSize", String(SEARCH_PAGE_SIZE));
    return params;
};
const getPrimaryBreakdownValue = (item, ownedOnly) => ownedOnly ? item.playableOwnedCopies : item.titleCount;
const formatBreakdownMetricLabel = (ownedOnly) => (ownedOnly ? "playable copies" : "titles");
const mergeSharedFilterFields = (target, source) => ({
    ...target,
    q: source.q,
    format: source.format,
    colors: [...source.colors],
    mechanics: [...source.mechanics],
    types: [...source.types],
    subtypes: source.subtypes,
    rarity: [...source.rarity],
    playableCountMin: source.playableCountMin,
    playableCountMax: source.playableCountMax,
    manaValueMin: source.manaValueMin,
    manaValueMax: source.manaValueMax
});
const clearDrilldownState = (state) => ({
    ...state,
    drilldownKind: "",
    drilldownKey: "",
    drilldownLabel: ""
});
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
const getUntappedCaptureIdentity = (capture) => capture ? `${capture.path}::${capture.modifiedAt}` : null;
const getCollectorCaptureIdentity = (capture) => capture ? `${capture.path}::${capture.modifiedAt}` : null;
function App() {
    const [status, setStatus] = useState(null);
    const [mechanics, setMechanics] = useState([]);
    const [searchState, setSearchState] = useState(defaultSearch);
    const deferredSearchState = useDeferredValue(searchState);
    const [statsState, setStatsState] = useState(defaultStatsFilters);
    const deferredStatsState = useDeferredValue(statsState);
    const [cards, setCards] = useState([]);
    const [cardsTotal, setCardsTotal] = useState(0);
    const [cardStats, setCardStats] = useState(null);
    const [visibleResultsCount, setVisibleResultsCount] = useState(INITIAL_VISIBLE_RESULTS);
    const [searchLoading, setSearchLoading] = useState(false);
    const [statsLoading, setStatsLoading] = useState(false);
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
    const switchTab = (nextTab) => {
        if (typeof window !== "undefined" && activeTab === "search" && nextTab !== "search") {
            searchScrollTopRef.current = window.scrollY;
        }
        if (activeTab !== "search" && nextTab === "search") {
            shouldRestoreSearchScrollRef.current = true;
        }
        setActiveTab(nextTab);
    };
    const updateSearchFilters = (updater) => {
        setSearchState((current) => {
            const next = updater(current);
            setStatsState((other) => mergeSharedFilterFields(other, next));
            return next;
        });
    };
    const updateStatsFilters = (updater) => {
        setStatsState((current) => {
            const next = updater(current);
            setSearchState((other) => mergeSharedFilterFields(other, next));
            return next;
        });
    };
    const openStatsSearchView = (options) => {
        const syncedSearchState = mergeSharedFilterFields(defaultSearch, statsState);
        setSearchState({
            ...syncedSearchState,
            ownedOnly: statsState.ownedOnly,
            drilldownKind: options?.drilldownKind ?? "",
            drilldownKey: options?.drilldownKey ?? "",
            drilldownLabel: options?.drilldownLabel ?? ""
        });
        switchTab("search");
    };
    const openStatsDrilldown = (drilldownKind, item) => {
        openStatsSearchView({
            drilldownKind,
            drilldownKey: item.key,
            drilldownLabel: item.label
        });
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
        const runSearch = async () => {
            try {
                setSearchLoading(true);
                const response = await searchCards(buildSearchParams(deferredSearchState));
                setCards(response.items);
                setCardsTotal(response.total);
                setVisibleResultsCount(Math.min(response.items.length, INITIAL_VISIBLE_RESULTS));
            }
            catch (error) {
                setErrorMessage(error instanceof Error ? error.message : "Card search failed.");
            }
            finally {
                setSearchLoading(false);
            }
        };
        void runSearch();
    }, [deferredSearchState]);
    useEffect(() => {
        const runStats = async () => {
            try {
                setStatsLoading(true);
                const response = await getCardStats(buildSearchParams(deferredStatsState));
                setCardStats(response);
            }
            catch (error) {
                setErrorMessage(error instanceof Error ? error.message : "Card stats failed.");
            }
            finally {
                setStatsLoading(false);
            }
        };
        void runStats();
    }, [deferredStatsState]);
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
    useEffect(() => {
        if (activeTab !== "import" || !untappedGuideActive || typeof window === "undefined") {
            return;
        }
        let cancelled = false;
        const poll = async () => {
            try {
                const nextStatus = await getUntappedHelperStatus();
                if (cancelled) {
                    return;
                }
                setUntappedHelperStatus(nextStatus);
                if (!nextStatus.showDevTools) {
                    setUntappedGuideActive(false);
                }
                const latestCaptureId = getUntappedCaptureIdentity(nextStatus.latestCapture);
                if (!latestCaptureId || latestCaptureId === lastAutoPreviewedCaptureId) {
                    return;
                }
                setLastAutoPreviewedCaptureId(latestCaptureId);
                setUntappedPreviewLoading(true);
                try {
                    const preview = await previewLatestUntappedCapture();
                    if (cancelled) {
                        return;
                    }
                    setUntappedFile(null);
                    setUntappedPreview(preview);
                    setUntappedPreviewSource("latest-capture");
                    setImportMessage(`Detected new Untapped capture: ${preview.capture.filename}. Preview updated automatically.`);
                }
                catch (error) {
                    if (!cancelled) {
                        setErrorMessage(error instanceof Error ? error.message : "Failed to preview the latest Untapped capture.");
                    }
                }
                finally {
                    if (!cancelled) {
                        setUntappedPreviewLoading(false);
                    }
                }
            }
            catch (error) {
                if (!cancelled) {
                    setErrorMessage(error instanceof Error ? error.message : "Failed to poll Untapped capture status.");
                }
            }
        };
        void poll();
        const intervalId = window.setInterval(() => {
            void poll();
        }, 2500);
        return () => {
            cancelled = true;
            window.clearInterval(intervalId);
        };
    }, [activeTab, lastAutoPreviewedCaptureId, untappedGuideActive]);
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
    const sidebarDerivedGroups = groupMechanics(sortedMechanics.filter((mechanic) => mechanic.type === "derived" && !favoriteSet.has(mechanic.slug)), getDerivedBucketId, derivedBucketLabels, derivedBucketOrder);
    const glossaryFavorites = glossaryItems.filter((mechanic) => favoriteSet.has(mechanic.slug));
    const glossaryDerivedGroups = groupMechanics(glossaryItems.filter((mechanic) => mechanic.type === "derived" && !favoriteSet.has(mechanic.slug)), getDerivedBucketId, derivedBucketLabels, derivedBucketOrder);
    const glossaryKeywordGroups = groupMechanics(glossaryItems.filter((mechanic) => mechanic.type === "keyword" && !favoriteSet.has(mechanic.slug)), getKeywordBucketId, keywordBucketLabels, keywordBucketOrder);
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
    const renderDeckDisplayControls = (compact = false) => (_jsxs("div", { className: compact ? "deck-display-toolbar compact" : "deck-display-toolbar", children: [_jsxs("label", { className: "field inline-field", children: [_jsx("span", { children: "Sort" }), _jsxs("select", { value: deckSort, onChange: (event) => setDeckSort(event.target.value), children: [_jsx("option", { value: "added", children: "Added" }), _jsx("option", { value: "name", children: "Name" }), _jsx("option", { value: "manaValue", children: "Cost" }), _jsx("option", { value: "typeLine", children: "Type" }), _jsx("option", { value: "quantity", children: "Quantity" })] })] }), _jsxs("label", { className: "field inline-field", children: [_jsx("span", { children: "Group" }), _jsxs("select", { value: deckGroup, onChange: (event) => setDeckGroup(event.target.value), children: [_jsx("option", { value: "section", children: "Section" }), _jsx("option", { value: "typeLine", children: "Type" }), _jsx("option", { value: "manaValue", children: "Cost" }), _jsx("option", { value: "none", children: "None" })] })] })] }));
    const renderCollectionImportPreview = (preview, options) => (_jsxs("div", { className: "untapped-preview", children: [_jsxs("div", { className: "panel-header preview-header", children: [_jsxs("div", { children: [_jsx("h3", { children: "Preview" }), _jsxs("span", { children: [formatImportPreviewContext(preview), options.contextSuffix ? ` · ${options.contextSuffix}` : ""] })] }), _jsx("button", { className: "primary-button", disabled: options.importing, onClick: options.onConfirm, type: "button", children: options.importing ? "Importing..." : "Confirm import" })] }), _jsxs("div", { className: "snapshot-grid import-preview-grid", children: [_jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Owned titles" }), _jsx("strong", { children: preview.ownedTitles })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Playable copies" }), _jsx("strong", { children: preview.ownedCopies })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Variant copies" }), _jsx("strong", { children: preview.rawOwnedCopies })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Matched grpIds" }), _jsx("strong", { children: preview.matchedGrpIds })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Unmatched grpIds" }), _jsx("strong", { children: preview.unmatchedGrpIds })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Extracted path" }), _jsx("strong", { children: preview.extractedPath })] }), preview.snapshotMetadata?.capturedAt ? (_jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Captured at" }), _jsx("strong", { children: formatDateTime(preview.snapshotMetadata.capturedAt) })] })) : null, preview.snapshotMetadata?.collectorVersion ? (_jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Collector" }), _jsx("strong", { children: preview.snapshotMetadata.collectorVersion })] })) : null] }), _jsxs("div", { className: "snapshot-grid import-diff-grid", children: [_jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Added titles" }), _jsx("strong", { children: preview.diff.addedTitles })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Removed titles" }), _jsx("strong", { children: preview.diff.removedTitles })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Changed titles" }), _jsx("strong", { children: preview.diff.changedTitles })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Unchanged titles" }), _jsx("strong", { children: preview.diff.unchangedTitles })] })] }), preview.unresolvedCards.length ? (_jsxs("div", { className: "subpanel import-warning-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Unresolved local matches" }), _jsx("span", { children: preview.unresolvedCards.length })] }), _jsx("ul", { className: "issue-list", children: preview.unresolvedCards.slice(0, 6).map((entry) => (_jsxs("li", { children: [entry.name, ": ", entry.titleCount, " playable, ", entry.printCount, " variant copies"] }, entry.name))) })] })) : null, preview.unmatchedEntries.length ? (_jsxs("div", { className: "subpanel import-warning-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Catalog misses" }), _jsx("span", { children: preview.unmatchedEntries.length })] }), _jsx("ul", { className: "issue-list", children: preview.unmatchedEntries.slice(0, 6).map((entry) => (_jsxs("li", { children: ["grpId ", entry.grpId, ": qty ", entry.quantity] }, entry.grpId))) })] })) : null] }));
    const renderSharedFilters = (state, updateState, options) => (_jsxs(_Fragment, { children: [_jsxs("label", { className: "field", children: [_jsx("span", { children: "Text" }), _jsx("input", { value: state.q, onChange: (event) => updateState((current) => ({ ...current, q: event.target.value })), placeholder: "Search name or oracle text" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Format" }), _jsx("select", { value: state.format, onChange: (event) => updateState((current) => ({ ...current, format: event.target.value })), children: FORMATS.map(([value, label]) => (_jsx("option", { value: value, children: label }, value))) })] }), _jsxs("label", { className: state.ownedOnly ? "inline-toggle toggle-switch active" : "inline-toggle toggle-switch", children: [_jsx("input", { className: "toggle-switch-input", checked: state.ownedOnly, onChange: (event) => updateState((current) => ({ ...current, ownedOnly: event.target.checked })), type: "checkbox" }), _jsx("span", { className: "toggle-switch-track", "aria-hidden": "true", children: _jsx("span", { className: "toggle-switch-thumb" }) }), _jsxs("span", { className: "toggle-switch-copy", children: [_jsx("strong", { children: options.ownedLabel }), _jsx("small", { children: state.ownedOnly ? options.ownedHintOn : options.ownedHintOff })] })] }), _jsxs("div", { className: "filter-group", children: [_jsx("span", { children: "Colors" }), _jsx("div", { className: "chip-grid", children: COLORS.map((color) => (_jsx("button", { className: state.colors.includes(color) ? "chip active" : "chip", onClick: () => updateState((current) => ({ ...current, colors: toggleValue(current.colors, color) })), type: "button", children: color }, color))) })] }), _jsxs("div", { className: "filter-group", children: [_jsx("span", { children: "Types" }), _jsx("div", { className: "chip-grid", children: CARD_TYPES.map((type) => (_jsx("button", { className: state.types.includes(type) ? "chip active" : "chip", onClick: () => updateState((current) => ({ ...current, types: toggleValue(current.types, type) })), type: "button", children: type }, type))) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Subtype / tribe" }), _jsx("input", { placeholder: "Kithkin, Shrine, Angel", value: state.subtypes, onChange: (event) => updateState((current) => ({ ...current, subtypes: event.target.value })) })] }), _jsxs("div", { className: "filter-group", children: [_jsx("span", { children: "Rarity" }), _jsx("div", { className: "chip-grid", children: RARITIES.map((rarity) => (_jsx("button", { className: state.rarity.includes(rarity) ? "chip active" : "chip", onClick: () => updateState((current) => ({ ...current, rarity: toggleValue(current.rarity, rarity) })), type: "button", children: rarity }, rarity))) })] }), _jsxs("div", { className: "filter-group", children: [_jsxs("div", { className: "filter-heading", children: [_jsx("span", { children: "Mechanics" }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => setGlossaryOpen(true), type: "button", children: "Glossary" })] }), options.selectedMechanics.length ? (_jsxs("div", { className: "mechanic-section", children: [_jsx("span", { className: "mechanic-section-title", children: "Selected" }), _jsx("div", { className: "chip-grid", children: options.selectedMechanics.map((mechanic) => (_jsx("button", { className: "chip active", title: mechanic.definition, onClick: () => toggleMechanic(mechanic.slug), type: "button", children: mechanic.label }, `selected-${mechanic.slug}`))) })] })) : null, sidebarFavorites.length ? (_jsxs("div", { className: "mechanic-section", children: [_jsx("span", { className: "mechanic-section-title", children: "Pinned" }), _jsx("div", { className: "chip-grid", children: sidebarFavorites.map((mechanic) => (_jsx("button", { className: sidebarMechanicSelection.includes(mechanic.slug) ? "chip active" : "chip", title: mechanic.definition, onClick: () => toggleMechanic(mechanic.slug), type: "button", children: mechanic.label }, `favorite-${mechanic.slug}`))) })] })) : null, sidebarDerivedGroups.map((section) => (_jsxs("div", { className: "mechanic-section", children: [_jsx("span", { className: "mechanic-section-title", children: section.label }), _jsx("div", { className: "chip-grid mechanic-grid compact-grid", children: section.items.map((mechanic) => (_jsx("button", { className: sidebarMechanicSelection.includes(mechanic.slug) ? "chip active" : "chip", title: mechanic.definition, onClick: () => toggleMechanic(mechanic.slug), type: "button", children: mechanic.label }, mechanic.slug))) })] }, `sidebar-${section.id}`)))] }), _jsxs("div", { className: "mana-range", children: [_jsxs("label", { className: "field", children: [_jsx("span", { children: "Playable count min" }), _jsx("input", { inputMode: "numeric", value: state.playableCountMin, onChange: (event) => updateState((current) => ({ ...current, playableCountMin: event.target.value })) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Playable count max" }), _jsx("input", { inputMode: "numeric", value: state.playableCountMax, onChange: (event) => updateState((current) => ({ ...current, playableCountMax: event.target.value })) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Mana value min" }), _jsx("input", { inputMode: "numeric", value: state.manaValueMin, onChange: (event) => updateState((current) => ({ ...current, manaValueMin: event.target.value })) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Mana value max" }), _jsx("input", { inputMode: "numeric", value: state.manaValueMax, onChange: (event) => updateState((current) => ({ ...current, manaValueMax: event.target.value })) })] })] }), _jsx("button", { className: "ghost-button subtle-button filters-clear", onClick: options.onClear, type: "button", children: "Clear filters" })] }));
    const renderStatsBreakdown = (title, items, drilldownKind, ownedOnly, emptyMessage) => {
        const maxValue = Math.max(...items.map((entry) => getPrimaryBreakdownValue(entry, ownedOnly)), 1);
        return (_jsxs("section", { className: "panel stats-section", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h3", { children: title }), _jsxs("span", { children: ["Primary metric: ", formatBreakdownMetricLabel(ownedOnly)] })] }), _jsxs("span", { children: [items.length, " rows"] })] }), items.length ? (_jsx("div", { className: "stats-breakdown-list", children: items.map((item) => {
                        const primaryValue = getPrimaryBreakdownValue(item, ownedOnly);
                        const width = `${Math.max((primaryValue / maxValue) * 100, primaryValue > 0 ? 4 : 0)}%`;
                        return (_jsxs("article", { className: "stats-breakdown-row", children: [_jsxs("div", { className: "stats-breakdown-copy", children: [_jsx("strong", { children: item.label }), _jsxs("span", { children: [item.titleCount, " titles \u00B7 ", item.playableOwnedCopies, " playable \u00B7 ", item.rawOwnedCopies, " raw"] })] }), _jsx("div", { className: "stats-breakdown-bar-shell", "aria-hidden": "true", children: _jsx("div", { className: "stats-breakdown-bar", style: { width } }) }), _jsxs("div", { className: "stats-breakdown-actions", children: [_jsx("strong", { className: "stats-breakdown-value", children: primaryValue.toLocaleString() }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => openStatsDrilldown(drilldownKind, item), type: "button", children: "View cards" })] })] }, `${title}-${item.key}`));
                    }) })) : (_jsx("div", { className: "stats-empty-message", children: emptyMessage }))] }));
    };
    const statsSummaryCards = cardStats
        ? [
            { label: "Matching titles", value: cardStats.summary.matchingTitles },
            { label: "Playable owned copies", value: cardStats.summary.playableOwnedCopies },
            { label: "Raw owned copies", value: cardStats.summary.rawOwnedCopies },
            { label: "Average mana value", value: cardStats.summary.averageManaValue },
            { label: "Sets represented", value: cardStats.summary.setsRepresented },
            { label: "Mechanics represented", value: cardStats.summary.mechanicsRepresented }
        ]
        : [];
    return (_jsxs("div", { className: "app-shell", children: [_jsxs("header", { className: "app-header", children: [_jsxs("div", { className: "app-header-left", children: [_jsx("div", { className: "app-brand compact-brand", children: _jsx("h1", { children: "Collection Explorer" }) }), _jsx("nav", { className: "tab-strip app-tabs compact-tabs", children: [
                                    ["search", "Search"],
                                    ["stats", "Stats"],
                                    ["decks", "Decks"]
                                ].map(([tab, label]) => (_jsx("button", { className: activeTab === tab ? "tab-button active" : "tab-button", onClick: () => switchTab(tab), type: "button", children: label }, tab))) })] }), _jsxs("div", { className: "app-header-right", children: [_jsxs("details", { className: "header-menu", children: [_jsx("summary", { className: "header-menu-trigger", children: "Catalog" }), _jsxs("div", { className: "header-menu-panel stats-menu", children: [_jsxs("div", { className: "header-stat-row", children: [_jsx("span", { children: "Catalog" }), _jsx("strong", { children: status?.cards.total ?? 0 })] }), _jsxs("div", { className: "header-stat-row", children: [_jsx("span", { children: "Unique names" }), _jsx("strong", { children: status?.collection.uniqueNames ?? 0 })] }), _jsxs("div", { className: "header-stat-row", children: [_jsx("span", { children: "Owned copies" }), _jsx("strong", { children: status?.collection.ownedCopies ?? 0 })] }), _jsxs("div", { className: "header-stat-row", children: [_jsx("span", { children: "Owned rows" }), _jsx("strong", { children: status?.collection.importRowsWithCopies ?? 0 })] })] })] }), _jsxs("details", { className: "header-menu", children: [_jsxs("summary", { className: "header-menu-trigger", children: [_jsx("span", { className: `scheme-tone ${activeTheme.tone}`, "aria-hidden": "true" }), _jsx("span", { children: activeTheme.label })] }), _jsxs("div", { className: "header-menu-panel theme-menu", children: [_jsxs("div", { className: "theme-menu-group", children: [_jsx("span", { className: "theme-menu-heading", children: "Dark" }), darkThemes.map((option) => (_jsxs("button", { className: theme === option.value ? "theme-menu-item active" : "theme-menu-item", onClick: () => setTheme(option.value), type: "button", children: [_jsx("span", { className: `scheme-tone ${option.tone}`, "aria-hidden": "true" }), _jsx("span", { children: option.label }), _jsx("small", { children: option.tone })] }, option.value)))] }), _jsxs("div", { className: "theme-menu-group", children: [_jsx("span", { className: "theme-menu-heading", children: "Light" }), lightThemes.map((option) => (_jsxs("button", { className: theme === option.value ? "theme-menu-item active" : "theme-menu-item", onClick: () => setTheme(option.value), type: "button", children: [_jsx("span", { className: `scheme-tone ${option.tone}`, "aria-hidden": "true" }), _jsx("span", { children: option.label }), _jsx("small", { children: option.tone })] }, option.value)))] })] })] }), _jsx("button", { className: activeTab === "import" ? "tab-button active" : "tab-button", onClick: () => switchTab("import"), type: "button", children: "Import" })] })] }), errorMessage ? _jsx("div", { className: "banner error", children: errorMessage }) : null, importMessage ? _jsx("div", { className: "banner success", children: importMessage }) : null, status && status.cards.total === 0 ? (_jsxs("div", { className: "banner warning", children: ["No Arena catalog is loaded yet. Run ", _jsx("code", { children: "npm run db:sync" }), " from the project root, then refresh the app."] })) : null, _jsxs("main", { className: activeTab === "search" || activeTab === "stats" ? "app-main search-main" : "app-main", children: [activeTab === "search" ? (_jsxs("div", { className: filtersCollapsed ? "search-layout filters-collapsed" : "search-layout", children: [!filtersCollapsed ? (_jsx("aside", { className: "search-sidebar", children: _jsxs("section", { className: "panel filters-panel", children: [_jsxs("div", { className: "panel-header filters-panel-header", children: [_jsxs("button", { className: "ghost-button subtle-button cart-button header-cart-button", onClick: () => setDeckDrawerOpen(true), type: "button", children: [_jsxs("span", { className: "deck-cart-icon", "aria-hidden": "true", children: [_jsx("span", {}), _jsx("span", {})] }), _jsx("span", { className: "cart-button-label", children: selectedDeckLabel }), _jsx("span", { className: "cart-badge", children: activeDeckTotalCards })] }), _jsx("div", { className: "panel-actions", children: _jsx("button", { "aria-label": "Collapse filters", className: "ghost-button subtle-button icon-button", onClick: () => setFiltersCollapsed(true), type: "button", children: "\u2190" }) })] }), renderSharedFilters(searchState, updateSearchFilters, {
                                            ownedLabel: "Owned cards only",
                                            ownedHintOn: "Showing only your imported collection",
                                            ownedHintOff: "Showing the full Arena catalog",
                                            onClear: () => updateSearchFilters(() => defaultSearch),
                                            selectedMechanics: selectedSearchMechanics
                                        })] }) })) : (_jsx("button", { "aria-label": "Expand filters", className: "ghost-button subtle-button search-expand-fab", onClick: () => setFiltersCollapsed(false), type: "button", children: "\u2192" })), _jsxs("section", { className: "panel results-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { className: "results-header-main", children: [_jsx("h2", { children: "Search Results" }), _jsx("span", { children: searchLoading
                                                            ? "Searching..."
                                                            : `Showing ${Math.min(visibleResultsCount, cards.length)} of ${cardsTotal} matches` })] }), _jsx("div", { className: "view-toggle", children: ["grid", "list", "table"].map((mode) => (_jsx("button", { className: viewMode === mode ? "view-button active" : "view-button", onClick: () => setViewMode(mode), type: "button", children: mode.charAt(0).toUpperCase() + mode.slice(1) }, mode))) })] }), searchState.drilldownKind && searchState.drilldownLabel ? (_jsxs("div", { className: "stats-drilldown-banner", children: [_jsxs("div", { children: [_jsx("strong", { children: "Metric filter active" }), _jsxs("span", { children: ["Showing cards from the current filter set plus ", searchState.drilldownLabel, "."] })] }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => setSearchState((current) => clearDrilldownState(current)), type: "button", children: "Clear metric filter" })] })) : null, viewMode === "grid" ? (_jsx("div", { className: "results-grid", children: visibleCards.map((card) => (_jsxs("article", { className: "card-tile", children: [_jsx(ColorStrip, { colors: getCardAccentColors(card) }), _jsxs("div", { className: "card-tile-body", children: [_jsxs("div", { className: "card-tile-header", children: [_jsxs("div", { children: [_jsx("h3", { children: card.name }), _jsx("p", { children: card.typeLine })] }), _jsxs("div", { className: "card-corner", children: [_jsx(CardCornerVisual, { card: card }), _jsx(OwnershipDots, { card: card })] })] }), _jsx("p", { className: "rules-text", children: _jsx(RenderOraclePreview, { text: card.oracleText }) }), _jsx("div", { className: "tag-row", children: card.mechanics.slice(0, 6).map((mechanic) => (_jsx("span", { className: `tag ${mechanic.type}`, title: mechanic.definition, children: mechanic.label }, mechanic.slug))) }), _jsx("div", { className: "card-meta", children: _jsx(CardMetaSummary, { card: card }) }), _jsx("div", { className: "card-actions", children: renderActions(card) })] })] }, card.id))) })) : null, viewMode === "list" ? (_jsx("div", { className: "results-list", children: visibleCards.map((card) => (_jsxs("article", { className: "result-row", children: [_jsx(ColorStrip, { colors: getCardAccentColors(card) }), _jsxs("div", { className: "result-row-body", children: [_jsxs("div", { className: "result-row-main", children: [_jsxs("div", { className: "result-row-title", children: [_jsx("strong", { children: card.name }), _jsx("span", { children: card.typeLine })] }), _jsx("div", { className: "result-row-oracle", children: _jsx(RenderOraclePreview, { className: "oracle-preview", text: card.oracleText }) }), _jsxs("div", { className: "result-row-footer", children: [_jsx("div", { className: "card-meta", children: _jsx(CardMetaSummary, { card: card }) }), _jsx("div", { className: "list-mechanics", children: getMechanicSummary(card, 4) || "No indexed mechanics" })] })] }), _jsxs("div", { className: "result-row-side", children: [_jsx(CardCornerVisual, { card: card, compactLand: true }), _jsx(OwnershipDots, { card: card }), _jsx("div", { className: "card-actions compact-actions", children: renderActions(card) })] })] })] }, card.id))) })) : null, viewMode === "table" ? (_jsx("div", { className: "results-table-wrap", children: _jsxs("table", { className: "results-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: _jsx("button", { className: "table-sort", onClick: () => toggleTableSort("name"), type: "button", children: "Name" }) }), _jsx("th", { children: _jsx("button", { className: "table-sort table-sort-center", onClick: () => toggleTableSort("manaCost"), type: "button", children: "Cost" }) }), _jsx("th", { children: _jsx("button", { className: "table-sort table-sort-center", onClick: () => toggleTableSort("manaValue"), type: "button", children: "MV" }) }), _jsx("th", { children: _jsx("button", { className: "table-sort", onClick: () => toggleTableSort("typeLine"), type: "button", children: "Type" }) }), _jsx("th", { children: _jsx("button", { className: "table-sort table-sort-center", onClick: () => toggleTableSort("ownedCount"), type: "button", children: "Playable" }) }), _jsx("th", { children: _jsx("button", { className: "table-sort table-sort-center", onClick: () => toggleTableSort("rawOwnedCount"), type: "button", children: "Raw" }) }), _jsx("th", { children: _jsx("button", { className: "table-sort", onClick: () => toggleTableSort("set"), type: "button", children: "Set" }) }), _jsx("th", { children: _jsx("button", { className: "table-sort", onClick: () => toggleTableSort("rarity"), type: "button", children: "Rarity" }) }), _jsx("th", { children: _jsx("button", { className: "table-sort", onClick: () => toggleTableSort("mechanics"), type: "button", children: "Mechanics" }) }), _jsx("th", { className: "table-head-center", children: "Actions" })] }) }), _jsx("tbody", { children: visibleSortedCards.map((card) => (_jsxs("tr", { children: [_jsx("td", { children: _jsxs("button", { className: "table-card-trigger table-name table-name-accent", onClick: () => void openCardDetail(card), type: "button", children: [_jsx(VerticalColorStrip, { colors: getCardAccentColors(card) }), _jsx("strong", { children: card.name }), _jsx("span", { children: card.typeLine })] }) }), _jsx("td", { className: "table-cell-center table-cell-graphic", children: _jsx(CardCornerVisual, { card: card, compactLand: true }) }), _jsx("td", { className: "table-cell-center", children: card.manaValue }), _jsx("td", { children: card.typeLine }), _jsx("td", { className: "table-cell-center", children: card.deckBuildingLimit === null ? "∞" : card.ownedCount }), _jsx("td", { className: "table-cell-center", children: card.rawOwnedCount }), _jsx("td", { children: card.preferredSetCode ?? "SET" }), _jsx("td", { children: card.rarity }), _jsx("td", { children: getMechanicSummary(card, 3) || "None" }), _jsx("td", { className: "table-cell-center table-cell-actions", children: _jsx("div", { className: "card-actions table-actions", children: renderActions(card) }) })] }, `table-${card.id}`))) })] }) })) : null, !searchLoading && cards.length > 0 ? (_jsxs("div", { className: "results-footer", children: [_jsxs("span", { className: "results-summary", children: ["Loaded ", cards.length.toLocaleString(), " result", cards.length === 1 ? "" : "s", cardsTotal > cards.length ? ` of ${cardsTotal.toLocaleString()} total` : ""] }), _jsxs("div", { className: "results-actions", children: [visibleResultsCount < cards.length ? (_jsxs("button", { className: "ghost-button subtle-button", onClick: () => setVisibleResultsCount((current) => Math.min(current + VISIBLE_RESULTS_STEP, cards.length)), type: "button", children: ["Show ", Math.min(VISIBLE_RESULTS_STEP, cards.length - visibleResultsCount), " more"] })) : null, visibleResultsCount < cards.length ? (_jsx("button", { className: "ghost-button subtle-button", onClick: () => setVisibleResultsCount(cards.length), type: "button", children: "Show all loaded" })) : null] })] })) : null] })] })) : null, activeTab === "stats" ? (_jsxs("div", { className: "search-layout stats-layout", children: [_jsx("aside", { className: "search-sidebar", children: _jsxs("section", { className: "panel filters-panel", children: [_jsx("div", { className: "panel-header filters-panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: "Stats Filters" }), _jsx("span", { children: "Reuse the same card filters, then aggregate over the matching set." })] }) }), renderSharedFilters(statsState, updateStatsFilters, {
                                            ownedLabel: statsState.ownedOnly ? "Owned collection" : "Full catalog",
                                            ownedHintOn: "Playable copies drive the dashboard totals",
                                            ownedHintOff: "Counts include unowned Arena cards that match the filters",
                                            onClear: () => updateStatsFilters(() => defaultStatsFilters),
                                            selectedMechanics: selectedStatsMechanics
                                        })] }) }), _jsx("section", { className: "stats-dashboard", children: _jsxs("section", { className: "panel stats-hero-panel", children: [_jsx("div", { className: "panel-header", children: _jsxs("div", { children: [_jsx("h2", { children: statsState.ownedOnly ? "Owned collection stats" : "Full catalog stats" }), _jsx("span", { children: statsLoading
                                                            ? "Calculating stats..."
                                                            : "Dashboard metrics are computed directly from the filtered catalog." })] }) }), statsLoading ? (_jsx("div", { className: "stats-empty-message", children: "Calculating stats..." })) : !cardStats || cardStats.summary.matchingTitles === 0 ? (_jsx("div", { className: "stats-empty-message", children: "No cards match the current filters." })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "snapshot-grid stats-summary-grid", children: statsSummaryCards.map((card) => (_jsxs("div", { className: "stat-card summary-drilldown-card", children: [_jsx("span", { children: card.label }), _jsx("strong", { children: card.value.toLocaleString() }), _jsx("button", { className: "ghost-button subtle-button summary-drilldown-button", onClick: () => openStatsSearchView(), type: "button", children: "View cards" })] }, card.label))) }), _jsxs("div", { className: "stats-breakdown-grid", children: [renderStatsBreakdown("Color Breakdown", cardStats.breakdowns.colors, "color", statsState.ownedOnly, "No colors in the current result set."), renderStatsBreakdown("Mana Value Breakdown", cardStats.breakdowns.manaValues, "manaValue", statsState.ownedOnly, "No mana values available."), renderStatsBreakdown("Type Breakdown", cardStats.breakdowns.types, "type", statsState.ownedOnly, "No types in the current result set."), renderStatsBreakdown("Rarity Breakdown", cardStats.breakdowns.rarities, "rarity", statsState.ownedOnly, "No rarity data available.")] }), _jsxs("div", { className: "stats-breakdown-stack", children: [renderStatsBreakdown("Set Breakdown", cardStats.breakdowns.sets, "set", statsState.ownedOnly, "No sets in the current result set."), renderStatsBreakdown("Mechanic Breakdown", cardStats.breakdowns.mechanics, "mechanic", statsState.ownedOnly, "No mechanics in the current result set.")] })] }))] }) })] })) : null, activeTab === "decks" ? (_jsxs("div", { className: "workspace-grid", children: [_jsxs("section", { className: "panel deck-list-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Decks" }), _jsxs("span", { children: [deckList.length, " saved"] })] }), _jsxs("div", { className: "deck-creator", children: [_jsxs("label", { className: "field", children: [_jsx("span", { children: "Name" }), _jsx("input", { value: deckName, onChange: (event) => setDeckName(event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Format" }), _jsx("select", { value: deckFormat, onChange: (event) => setDeckFormat(event.target.value), children: FORMATS.map(([value, label]) => (_jsx("option", { value: value, children: label }, value))) })] }), _jsx("button", { className: "primary-button", onClick: handleCreateDeck, type: "button", children: "Create deck" })] }), _jsx("div", { className: "deck-list", children: deckList.map((deck) => (_jsxs("button", { className: activeDeck?.id === deck.id ? "deck-list-item active" : "deck-list-item", onClick: () => handleSelectDeck(deck.id), type: "button", children: [_jsx("strong", { children: deck.name }), _jsx("span", { children: FORMATS.find(([value]) => value === deck.format)?.[1] ?? deck.format }), _jsxs("small", { children: [deck.totalCards, " cards"] })] }, deck.id))) })] }), _jsx("section", { className: "panel deck-detail-panel", children: activeDeck ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: activeDeck.name }), _jsx("span", { children: FORMATS.find(([value]) => value === activeDeck.format)?.[1] })] }), _jsx("button", { className: "ghost-button", onClick: () => void saveDeck(activeDeck), type: "button", children: "Save deck" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Deck name" }), _jsx("input", { value: activeDeck.name, onChange: (event) => setActiveDeck({
                                                        ...activeDeck,
                                                        name: event.target.value
                                                    }) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Notes" }), _jsx("textarea", { rows: 3, value: activeDeck.notes, onChange: (event) => setActiveDeck({
                                                        ...activeDeck,
                                                        notes: event.target.value
                                                    }) })] }), renderDeckDisplayControls(), _jsx("div", { className: "deck-card-list", children: sortedDeckDisplayCards.length === 0 ? (_jsx("p", { className: "empty-state", children: "Start from the Search tab and add cards into this deck." })) : (deckCardGroups.map((group) => (_jsxs("section", { className: "deck-group", children: [deckGroup !== "none" ? (_jsxs("div", { className: "deck-group-header", children: [_jsx("strong", { children: group.label }), _jsxs("span", { children: [group.items.reduce((total, item) => total + item.quantity, 0), " cards"] })] })) : null, group.items.map((deckCard) => (_jsxs("div", { className: "deck-card-row", children: [_jsxs("div", { className: "cart-card-copy", children: [_jsx("strong", { children: deckCard.displayName }), _jsxs("p", { children: [deckCard.section, deckCard.displayTypeLine ? ` · ${deckCard.displayTypeLine}` : "", typeof deckCard.displayOwnedCount === "number" ? ` · own ${deckCard.displayOwnedCount}` : ""] })] }), _jsxs("div", { className: "quantity-controls", children: [_jsx("button", { onClick: () => handleChangeDeckQuantity(deckCard.cardId, deckCard.section, -1), type: "button", children: "-" }), _jsx("span", { children: deckCard.quantity }), _jsx("button", { onClick: () => handleChangeDeckQuantity(deckCard.cardId, deckCard.section, 1), type: "button", children: "+" })] })] }, `${deckCard.cardId}-${deckCard.section}`)))] }, `detail-group-${group.key}`)))) }), _jsxs("div", { className: "validation-grid", children: [_jsxs("div", { className: "subpanel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Validation" }), _jsx("button", { className: "ghost-button", onClick: async () => {
                                                                        if (!activeDeck) {
                                                                            return;
                                                                        }
                                                                        setValidation(await validateDeck(activeDeck.id));
                                                                    }, type: "button", children: "Refresh" })] }), validation?.issues.length ? (_jsx("ul", { className: "issue-list", children: validation.issues.map((issue) => (_jsx("li", { children: issue }, issue))) })) : (_jsx("p", { className: "empty-state", children: "No validation issues yet." }))] }), _jsxs("div", { className: "subpanel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Ownership gaps" }), _jsx("button", { className: "ghost-button", onClick: async () => {
                                                                        if (!activeDeck) {
                                                                            return;
                                                                        }
                                                                        const arenaExport = await exportDeck(activeDeck.id);
                                                                        setExportText(arenaExport.text);
                                                                    }, type: "button", children: "Refresh export" })] }), validation?.ownershipGaps.length ? (_jsx("ul", { className: "issue-list", children: validation.ownershipGaps.map((gap) => (_jsxs("li", { children: [gap.name, ": need ", gap.needed, ", own ", gap.owned, ", missing ", gap.missing] }, gap.cardId))) })) : (_jsx("p", { className: "empty-state", children: "No ownership gaps for the current list." }))] })] }), _jsxs("div", { className: "subpanel export-panel", children: [_jsx("div", { className: "panel-header", children: _jsx("h3", { children: "Arena Export" }) }), _jsx("textarea", { readOnly: true, rows: 12, value: exportText })] })] })) : (_jsx("p", { className: "empty-state", children: "Create a deck to start building." })) })] })) : null, activeTab === "import" ? (_jsxs("div", { className: "workspace-grid import-workspace", children: [_jsxs("section", { className: "panel import-panel snapshot-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Current Snapshot" }), _jsx("span", { children: "Collection status" })] }), _jsxs("div", { className: "snapshot-grid", children: [_jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Stored entries" }), _jsx("strong", { children: status?.collection.ownedEntries ?? 0 })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Unique names" }), _jsx("strong", { children: status?.collection.uniqueNames ?? 0 })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Owned copies" }), _jsx("strong", { children: status?.collection.ownedCopies ?? 0 })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Owned rows" }), _jsx("strong", { children: status?.collection.importRowsWithCopies ?? 0 })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Unresolved rows" }), _jsx("strong", { children: status?.collection.unresolvedEntries ?? 0 })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Imported at" }), _jsx("strong", { children: formatDateTime(status?.collection.importedAt ?? null) })] })] })] }), _jsxs("div", { className: "import-stack", children: [_jsxs("section", { className: "panel import-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Untapped Companion" }), _jsx("span", { children: "Safe bridge import" })] }), _jsxs("p", { className: "hero-copy", children: ["Capture a local ", _jsx("code", { children: "mtga.collection" }), " JSON dump from Untapped Companion, preview it here, then replace your current collection snapshot."] }), _jsxs("div", { className: "helper-toolbar", children: [_jsx("button", { className: "primary-button", disabled: untappedHelperLoading, onClick: handleStartUntappedGuide, type: "button", children: untappedHelperLoading ? "Starting..." : "Start guided capture" }), _jsx("button", { className: "ghost-button", onClick: handleCopyUntappedSnippet, type: "button", children: "Copy snippet" }), _jsx("button", { className: "ghost-button", disabled: !untappedHelperStatus?.latestCapture || untappedPreviewLoading, onClick: handlePreviewLatestUntappedCapture, type: "button", children: "Preview latest download" }), _jsx("button", { className: "ghost-button", disabled: untappedHelperLoading || !untappedHelperStatus?.showDevTools, onClick: handleStopUntappedGuide, type: "button", children: "Stop guided capture" })] }), _jsx("p", { className: "helper-note", children: "Guided mode enables Untapped DevTools, watches your Downloads folder, and previews the next capture automatically after the JSON download finishes." }), untappedHelperStatus ? (_jsxs("div", { className: "subpanel helper-status-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Local helper status" }), _jsx("span", { children: untappedGuideActive ? "Watching for new captures" : "Idle" })] }), _jsxs("div", { className: "snapshot-grid helper-status-grid", children: [_jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "DevTools" }), _jsx("strong", { children: untappedHelperStatus.showDevTools ? "Enabled" : "Disabled" })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Helper" }), _jsx("strong", { children: untappedHelperStatus.available ? "Ready" : "Unavailable" })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Latest capture" }), _jsx("strong", { children: untappedHelperStatus.latestCapture ? untappedHelperStatus.latestCapture.filename : "None yet" })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Updated" }), _jsx("strong", { children: untappedHelperStatus.latestCapture
                                                                            ? formatDateTime(untappedHelperStatus.latestCapture.modifiedAt)
                                                                            : "Waiting" })] })] }), _jsxs("div", { className: "helper-path-list", children: [_jsxs("p", { children: [_jsx("strong", { children: "Downloads:" }), " ", _jsx("code", { children: untappedHelperStatus.downloadsPath })] }), _jsxs("p", { children: [_jsx("strong", { children: "Config:" }), " ", _jsx("code", { children: untappedHelperStatus.configPath })] }), untappedHelperStatus.latestCapture ? (_jsxs("p", { children: [_jsx("strong", { children: "Latest file:" }), " ", _jsx("code", { children: untappedHelperStatus.latestCapture.path }), " (", formatFileSize(untappedHelperStatus.latestCapture.size), ")"] })) : null] })] })) : null, _jsxs("ol", { className: "import-steps", children: [_jsx("li", { children: "Open Untapped Companion and MTGA Deck Builder." }), _jsx("li", { children: "Open Untapped DevTools and run this console snippet." }), _jsx("li", { children: "Wait for the download or upload the JSON manually if the watcher misses it." })] }), _jsx("pre", { className: "capture-snippet", children: _jsx("code", { children: untappedHelperStatus?.snippet ?? UNTAPPED_CAPTURE_SNIPPET }) }), _jsxs("label", { className: "upload-drop", children: [_jsx("input", { accept: ".json,application/json", onChange: handleUntappedPreview, type: "file" }), _jsx("span", { children: untappedFile ? untappedFile.name : "Choose your Untapped collection JSON" }), _jsxs("small", { children: ["Raw ", _jsx("code", { children: "grpId -> quantity" }), " map exported from the Untapped renderer."] })] }), untappedPreviewLoading ? (_jsx("p", { className: "empty-state", children: "Previewing Untapped collection..." })) : null, untappedPreview ? (renderCollectionImportPreview(untappedPreview, {
                                                importing: untappedImporting,
                                                onConfirm: handleConfirmUntappedImport,
                                                contextSuffix: untappedPreviewSource === "latest-capture" && untappedHelperStatus?.latestCapture
                                                    ? untappedHelperStatus.latestCapture.filename
                                                    : undefined
                                            })) : null] }), _jsxs("section", { className: "panel import-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Collector Snapshot" }), _jsx("span", { children: "One-click local capture" })] }), _jsx("p", { className: "hero-copy", children: "Refresh directly from the running MTGA client, preview the captured snapshot here, then replace your current collection." }), _jsxs("div", { className: "helper-toolbar", children: [_jsx("button", { className: "primary-button", disabled: collectorHelperLoading || collectorSnapshotImporting, onClick: handleCaptureLatestCollectorSnapshot, type: "button", children: collectorHelperLoading ? "Refreshing..." : "Refresh From MTGA" }), _jsx("button", { className: "ghost-button", disabled: !collectorHelperStatus?.latestCapture || collectorHelperLoading || collectorSnapshotImporting, onClick: handlePreviewLatestCollectorSnapshot, type: "button", children: "Preview latest snapshot" })] }), _jsx("p", { className: "helper-note", children: "This uses the local signed collector host, writes a snapshot to disk, and then previews the result before import." }), _jsxs("ol", { className: "import-steps", children: [_jsx("li", { children: "Open MTG Arena and leave it running." }), _jsxs("li", { children: ["Click ", _jsx("strong", { children: "Refresh From MTGA" }), "."] }), _jsx("li", { children: "Wait for the preview to appear." }), _jsxs("li", { children: ["Check the counts, then click ", _jsx("strong", { children: "Confirm import" }), "."] })] }), collectorHelperStatus ? (_jsxs("div", { className: "subpanel helper-status-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Local collector status" }), _jsx("span", { children: collectorHelperStatus.available ? "Ready" : "Needs attention" })] }), _jsxs("div", { className: "snapshot-grid helper-status-grid", children: [_jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Collector" }), _jsx("strong", { children: collectorHelperStatus.available ? "Ready" : "Unavailable" })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "MTGA" }), _jsx("strong", { children: collectorHelperStatus.mtgaRunning
                                                                            ? `Running${collectorHelperStatus.mtgaPid ? ` · PID ${collectorHelperStatus.mtgaPid}` : ""}`
                                                                            : "Not detected" })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Addon" }), _jsx("strong", { children: collectorHelperStatus.addonAvailable ? "Found" : "Missing" })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "codesign" }), _jsx("strong", { children: collectorHelperStatus.codesignAvailable ? "Ready" : "Missing" })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Latest snapshot" }), _jsx("strong", { children: collectorHelperStatus.latestCapture ? collectorHelperStatus.latestCapture.filename : "None yet" })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Updated" }), _jsx("strong", { children: collectorHelperStatus.latestCapture
                                                                            ? formatDateTime(collectorHelperStatus.latestCapture.modifiedAt)
                                                                            : "Waiting" })] })] }), _jsxs("div", { className: "helper-path-list", children: [_jsxs("p", { children: [_jsx("strong", { children: "Snapshot path:" }), " ", _jsx("code", { children: collectorHelperStatus.snapshotPath })] }), _jsxs("p", { children: [_jsx("strong", { children: "Addon path:" }), " ", _jsx("code", { children: collectorHelperStatus.addonPath })] })] })] })) : null, _jsxs("label", { className: "upload-drop", children: [_jsx("input", { accept: ".json,application/json", onChange: handleCollectorSnapshotPreview, type: "file" }), _jsx("span", { children: collectorSnapshotFile ? collectorSnapshotFile.name : "Choose your collector snapshot JSON" }), _jsxs("small", { children: ["Supports ", _jsx("code", { children: `{ snapshotVersion, collection }` }), " or a raw ", _jsx("code", { children: "grpId -> quantity" }), " map."] })] }), collectorSnapshotPreviewLoading ? (_jsx("p", { className: "empty-state", children: "Previewing collector snapshot..." })) : null, collectorSnapshotPreview
                                                ? renderCollectionImportPreview(collectorSnapshotPreview, {
                                                    importing: collectorSnapshotImporting,
                                                    onConfirm: handleConfirmCollectorSnapshotImport,
                                                    contextSuffix: collectorPreviewSource === "latest-capture" &&
                                                        "capture" in collectorSnapshotPreview
                                                        ? collectorSnapshotPreview.capture.filename
                                                        : undefined
                                                })
                                                : null] }), _jsxs("section", { className: "panel import-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h2", { children: "Collection CSV" }), _jsx("span", { children: "Fallback import" })] }), _jsx("p", { className: "hero-copy", children: "Upload an MTG Arena collection export. The new file replaces the current ownership snapshot atomically." }), _jsxs("label", { className: "upload-drop", children: [_jsx("input", { accept: ".csv,text/csv", onChange: handleImport, type: "file" }), _jsx("span", { children: "Choose your Arena collection CSV" }), _jsx("small", { children: "Required columns: Id, Name, Set, Color, Rarity, Count, PrintCount" })] })] })] })] })) : null] }), glossaryOpen ? (_jsx("div", { className: "modal-shell", onClick: () => setGlossaryOpen(false), role: "presentation", children: _jsxs("div", { className: "modal-card glossary-modal", onClick: (event) => event.stopPropagation(), role: "dialog", "aria-modal": "true", "aria-label": "Mechanic glossary", children: [_jsxs("div", { className: "panel-header", children: [_jsxs("div", { children: [_jsx("h2", { children: "Mechanic Glossary" }), _jsxs("span", { children: [glossaryItems.length, " visible mechanics"] })] }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => setGlossaryOpen(false), type: "button", children: "Close" })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Find a mechanic" }), _jsx("input", { value: glossaryQuery, onChange: (event) => setGlossaryQuery(event.target.value), placeholder: "Search names and definitions" })] }), _jsxs("div", { className: "glossary-list modal-glossary-list", children: [glossaryFavorites.length ? (_jsxs("section", { className: "glossary-group", children: [_jsx("h3", { children: "Pinned" }), glossaryFavorites.map((mechanic) => {
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
                                            : "Choose or create a target deck here." })] }), drawerCreateMode || (!activeDeck && deckList.length === 0) ? (_jsxs("div", { className: "subpanel quick-create-panel", children: [_jsxs("div", { className: "panel-header", children: [_jsx("h3", { children: "Create a new target deck" }), _jsx("span", { children: "Quick create" })] }), _jsxs("div", { className: "deck-creator quick-deck-creator", children: [_jsxs("label", { className: "field", children: [_jsx("span", { children: "Name" }), _jsx("input", { value: quickDeckName, onChange: (event) => setQuickDeckName(event.target.value) })] }), _jsxs("label", { className: "field", children: [_jsx("span", { children: "Format" }), _jsx("select", { value: quickDeckFormat, onChange: (event) => setQuickDeckFormat(event.target.value), children: FORMATS.map(([value, label]) => (_jsx("option", { value: value, children: label }, `drawer-quick-${value}`))) })] }), _jsxs("div", { className: "drawer-actions", children: [_jsx("button", { className: "primary-button", onClick: () => void handleQuickCreateDeck(), type: "button", children: "Create and use" }), deckList.length ? (_jsx("button", { className: "ghost-button subtle-button", onClick: () => setDrawerCreateMode(false), type: "button", children: "Cancel" })) : null] })] })] })) : null, activeDeck ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "drawer-summary-grid", children: [_jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Total" }), _jsx("strong", { children: activeDeckTotalCards })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Main" }), _jsx("strong", { children: activeDeckSectionTotals.main })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Side" }), _jsx("strong", { children: activeDeckSectionTotals.sideboard })] }), _jsxs("div", { className: "stat-card dense", children: [_jsx("span", { children: "Cmdr" }), _jsx("strong", { children: activeDeckSectionTotals.commander })] })] }), _jsxs("div", { className: "drawer-meta", children: [_jsx("span", { children: validation ? `${validation.issues.length} validation issue(s)` : "Validation not loaded yet" }), _jsx("span", { children: validation ? `${validation.ownershipGaps.length} ownership gap(s)` : "Ownership gaps pending" })] }), _jsxs("div", { className: "drawer-controls", children: [renderDeckDisplayControls(true), _jsxs("div", { className: "drawer-actions", children: [_jsx("button", { className: "ghost-button subtle-button", onClick: handleOpenDeckDetails, type: "button", children: "Open full deck" }), _jsx("button", { className: "ghost-button subtle-button", onClick: () => void saveDeck(activeDeck), type: "button", children: "Save now" })] })] }), _jsx("div", { className: "deck-card-list deck-cart-list", children: sortedDeckDisplayCards.length === 0 ? (_jsx("p", { className: "empty-state", children: "Add cards from search and review them here as you build." })) : (deckCardGroups.map((group) => (_jsxs("section", { className: "deck-group", children: [deckGroup !== "none" ? (_jsxs("div", { className: "deck-group-header", children: [_jsx("strong", { children: group.label }), _jsxs("span", { children: [group.items.reduce((total, item) => total + item.quantity, 0), " cards"] })] })) : null, group.items.map((deckCard) => (_jsxs("div", { className: "deck-card-row cart-card-row", children: [_jsxs("div", { className: "cart-card-copy", children: [_jsx("strong", { children: deckCard.displayName }), _jsxs("p", { children: [deckCard.section, deckCard.displayTypeLine ? ` · ${deckCard.displayTypeLine}` : "", typeof deckCard.displayOwnedCount === "number" ? ` · own ${deckCard.displayOwnedCount}` : ""] })] }), _jsxs("div", { className: "quantity-controls", children: [_jsx("button", { onClick: () => void handleChangeDeckQuantity(deckCard.cardId, deckCard.section, -1), type: "button", children: "-" }), _jsx("span", { children: deckCard.quantity }), _jsx("button", { onClick: () => void handleChangeDeckQuantity(deckCard.cardId, deckCard.section, 1), type: "button", children: "+" })] })] }, `drawer-${deckCard.cardId}-${deckCard.section}`)))] }, `drawer-group-${group.key}`)))) })] })) : (_jsx("p", { className: "empty-state", children: "Choose a deck from the menu above, or create a new one here." }))] }) })) : null] }));
}
export default App;
