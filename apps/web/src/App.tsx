import { useDeferredValue, useEffect, useRef, useState, startTransition } from "react";
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
  createDeck,
  exportDeck,
  getCard,
  getDeck,
  getMechanics,
  getStatus,
  getUntappedHelperStatus,
  importUntappedCollection,
  importLatestUntappedCapture,
  listDecks,
  previewUntappedCollection,
  previewLatestUntappedCapture,
  startUntappedHelper,
  stopUntappedHelper,
  searchCards,
  updateDeck,
  uploadCollection,
  validateDeck
} from "./api";
import type {
  AppStatus,
  CardDetail,
  CardSummary,
  Deck,
  DeckCard,
  DeckListItem,
  UntappedCaptureFile,
  UntappedCaptureStatus,
  Mechanic,
  UntappedImportSummary,
  ValidationResult
} from "./types";

const FORMATS = [
  ["standard", "Standard"],
  ["alchemy", "Alchemy"],
  ["explorer", "Explorer"],
  ["historic", "Historic"],
  ["timeless", "Timeless"],
  ["brawl", "Brawl"],
  ["standardbrawl", "Standard Brawl"]
] as const;

const COLORS = ["W", "U", "B", "R", "G"];
const CARD_TYPES = ["Creature", "Instant", "Sorcery", "Artifact", "Enchantment", "Planeswalker", "Land"];
const RARITIES = ["common", "uncommon", "rare", "mythic"];

const defaultSearch = {
  q: "",
  format: "standard",
  colors: [] as string[],
  mechanics: [] as string[],
  types: [] as string[],
  subtypes: "",
  rarity: [] as string[],
  ownedOnly: false,
  manaValueMin: "",
  manaValueMax: ""
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

const derivedBucketLabels: Record<string, string> = {
  advantage: "Card Advantage",
  removal: "Removal",
  graveyard: "Graveyard",
  tokens: "Tokens and Counters",
  mana: "Mana and Ramp",
  synergy: "Synergy",
  combat: "Combat"
};

const derivedBucketOrder = ["advantage", "removal", "graveyard", "tokens", "mana", "synergy", "combat"] as const;

const keywordBucketLabels: Record<string, string> = {
  evasion: "Combat and Evasion",
  defense: "Defense and Protection",
  casting: "Casting and Timing",
  resources: "Resources and Objects",
  library: "Library and Graveyard",
  transformation: "Transform and Alternate Casting",
  misc: "Other Keywords"
};

const keywordBucketOrder = ["evasion", "defense", "casting", "resources", "library", "transformation", "misc"] as const;

type ResultsViewMode = "grid" | "list" | "table";
type AppTheme = (typeof THEME_OPTIONS)[number]["value"];
type DeckSortKey = "added" | "name" | "manaValue" | "typeLine" | "quantity";
type DeckGroupKey = "none" | "section" | "typeLine" | "manaValue";
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

const toggleValue = (values: string[], value: string) =>
  values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];

const getDerivedBucketId = (slug: string) => {
  if (["card-draw", "enter-the-battlefield"].includes(slug)) {
    return "advantage";
  }
  if (["spot-removal", "board-wipe", "counterspell", "burn"].includes(slug)) {
    return "removal";
  }
  if (
    ["self-mill", "discard", "discard-payoff", "graveyard-recursion", "reanimation", "graveyard-hate", "death-triggers"].includes(
      slug
    )
  ) {
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

const getKeywordBucketId = (slug: string) => {
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

const groupMechanics = (
  items: Mechanic[],
  bucketFor: (slug: string) => string,
  labels: Record<string, string>,
  order: readonly string[]
) => {
  const grouped = new Map<string, Mechanic[]>();
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
    if (order.includes(bucketId as (typeof order)[number])) {
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

const buildSearchParams = (state: typeof defaultSearch) => {
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
    params.set(
      "subtypes",
      state.subtypes
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .join(",")
    );
  }
  if (state.rarity.length) {
    params.set("rarity", state.rarity.join(","));
  }
  if (state.ownedOnly) {
    params.set("ownedOnly", "true");
  }
  if (state.manaValueMin) {
    params.set("manaValueMin", state.manaValueMin);
  }
  if (state.manaValueMax) {
    params.set("manaValueMax", state.manaValueMax);
  }
  params.set("page", "1");
  params.set("pageSize", String(SEARCH_PAGE_SIZE));
  return params;
};

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

const formatCatalogLabel = (preview: UntappedImportSummary | null) => {
  if (!preview) {
    return "Pending preview";
  }

  if (preview.catalogSource === "database") {
    return "Local catalog";
  }

  const buildLabel = preview.catalogMetadata?.build ? ` build ${preview.catalogMetadata.build}` : "";
  return `Untapped public${buildLabel}`;
};

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
  FORMATS.find(([value]) => value === format)?.[1] ?? format;
const truncateDeckName = (name: string, max = 16) =>
  name.length <= max ? name : `${name.slice(0, Math.max(1, max - 3))}...`;
const getDeckTypeBucket = (typeLine: string) =>
  CARD_TYPES.find((type) => typeLine.toLowerCase().includes(type.toLowerCase())) ?? "Other";
const getUntappedSearchUrl = (cardName: string) =>
  `https://duckduckgo.com/?q=${encodeURIComponent(`site:mtga.untapped.gg/meta/cards "${cardName}"`)}`;

type PendingAdd = {
  card: CardSummary;
  section: DeckCard["section"];
};

type UntappedPreviewSource = "manual-file" | "latest-capture";

const formatFileSize = (size: number) =>
  size >= 1024 ? `${(size / 1024).toFixed(1)} KB` : `${size} B`;

const getUntappedCaptureIdentity = (capture: UntappedCaptureFile | null) =>
  capture ? `${capture.path}::${capture.modifiedAt}` : null;

function App() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [searchState, setSearchState] = useState(defaultSearch);
  const deferredSearchState = useDeferredValue(searchState);
  const [cards, setCards] = useState<CardSummary[]>([]);
  const [cardsTotal, setCardsTotal] = useState(0);
  const [visibleResultsCount, setVisibleResultsCount] = useState(INITIAL_VISIBLE_RESULTS);
  const [searchLoading, setSearchLoading] = useState(false);
  const [deckList, setDeckList] = useState<DeckListItem[]>([]);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [exportText, setExportText] = useState("");
  const [activeTab, setActiveTab] = useState<"search" | "decks" | "import">("search");
  const [deckName, setDeckName] = useState("New Arena Deck");
  const [deckFormat, setDeckFormat] = useState<Deck["format"]>("standard");
  const [quickDeckName, setQuickDeckName] = useState("Search Deck");
  const [quickDeckFormat, setQuickDeckFormat] = useState<Deck["format"]>("standard");
  const [importMessage, setImportMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [untappedFile, setUntappedFile] = useState<File | null>(null);
  const [untappedPreview, setUntappedPreview] = useState<UntappedImportSummary | null>(null);
  const [untappedPreviewLoading, setUntappedPreviewLoading] = useState(false);
  const [untappedImporting, setUntappedImporting] = useState(false);
  const [untappedHelperStatus, setUntappedHelperStatus] = useState<UntappedCaptureStatus | null>(null);
  const [untappedHelperLoading, setUntappedHelperLoading] = useState(false);
  const [untappedGuideActive, setUntappedGuideActive] = useState(false);
  const [untappedPreviewSource, setUntappedPreviewSource] = useState<UntappedPreviewSource | null>(null);
  const [lastAutoPreviewedCaptureId, setLastAutoPreviewedCaptureId] = useState<string | null>(null);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [glossaryQuery, setGlossaryQuery] = useState("");
  const [deckDrawerOpen, setDeckDrawerOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [deckTargetMenuOpen, setDeckTargetMenuOpen] = useState(false);
  const [drawerCreateMode, setDrawerCreateMode] = useState(false);
  const [cardDetail, setCardDetail] = useState<CardDetail | null>(null);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [deckSort, setDeckSort] = useState<DeckSortKey>("added");
  const [deckGroup, setDeckGroup] = useState<DeckGroupKey>("section");
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
    await loadStatus();
    startTransition(() => {
      setSearchState((current) => ({ ...current }));
    });
  };

  const loadDecks = async (selectDeckId?: string) => {
    const decks = await listDecks();
    setDeckList(decks);
    const targetDeckId = selectDeckId ?? activeDeck?.id ?? decks[0]?.id;
    if (targetDeckId) {
      const deck = await getDeck(targetDeckId);
      setActiveDeck(deck);
    } else {
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
      } catch (error) {
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
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Card search failed.");
      } finally {
        setSearchLoading(false);
      }
    };
    void runSearch();
  }, [deferredSearchState]);

  useEffect(() => {
    const runMechanicsRefresh = async () => {
      try {
        const items = await getMechanics({ ownedOnly: searchState.ownedOnly });
        setMechanics(items);
        if (searchState.ownedOnly) {
          const available = new Set(items.map((item) => item.slug));
          setSearchState((current) => ({
            ...current,
            mechanics: current.mechanics.filter((mechanic) => available.has(mechanic))
          }));
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Mechanic list refresh failed.");
      }
    };
    void runMechanicsRefresh();
  }, [searchState.ownedOnly]);

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

    void refreshUntappedHelperStatus().catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load Untapped helper status.");
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
        } catch (error) {
          if (!cancelled) {
            setErrorMessage(error instanceof Error ? error.message : "Failed to preview the latest Untapped capture.");
          }
        } finally {
          if (!cancelled) {
            setUntappedPreviewLoading(false);
          }
        }
      } catch (error) {
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

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const result = await uploadCollection(file);
      setImportMessage(
        `Imported ${result.ownedCopies} owned copies across ${result.cardsMatched} cards. ` +
          `${result.unresolvedRows.length} rows could not be matched.`
      );
      await refreshCollectionViewsAfterImport();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Collection import failed.");
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

  const handleConfirmUntappedImport = async () => {
    if (!untappedPreviewSource) {
      return;
    }

    try {
      setErrorMessage("");
      setImportMessage("");
      setUntappedImporting(true);
      let result: UntappedImportSummary;

      if (untappedPreviewSource === "latest-capture") {
        const latestResult = await importLatestUntappedCapture();
        setLastAutoPreviewedCaptureId(getUntappedCaptureIdentity(latestResult.capture));
        result = latestResult;
      } else if (untappedFile) {
        result = await importUntappedCollection(untappedFile);
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
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Untapped import failed.");
    } finally {
      setUntappedImporting(false);
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
  const selectedMechanics = searchState.mechanics
    .map((slug) => sortedMechanics.find((mechanic) => mechanic.slug === slug))
    .filter((mechanic): mechanic is Mechanic => Boolean(mechanic));
  const sidebarFavorites = sortedMechanics.filter((mechanic) => favoriteSet.has(mechanic.slug));
  const sidebarDerivedGroups = groupMechanics(
    sortedMechanics.filter((mechanic) => mechanic.type === "derived" && !favoriteSet.has(mechanic.slug)),
    getDerivedBucketId,
    derivedBucketLabels,
    derivedBucketOrder
  );
  const glossaryFavorites = glossaryItems.filter((mechanic) => favoriteSet.has(mechanic.slug));
  const glossaryDerivedGroups = groupMechanics(
    glossaryItems.filter((mechanic) => mechanic.type === "derived" && !favoriteSet.has(mechanic.slug)),
    getDerivedBucketId,
    derivedBucketLabels,
    derivedBucketOrder
  );
  const glossaryKeywordGroups = groupMechanics(
    glossaryItems.filter((mechanic) => mechanic.type === "keyword" && !favoriteSet.has(mechanic.slug)),
    getKeywordBucketId,
    keywordBucketLabels,
    keywordBucketOrder
  );

  const toggleMechanic = (slug: string) => {
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
  const renderDeckDisplayControls = (compact = false) => (
    <div className={compact ? "deck-display-toolbar compact" : "deck-display-toolbar"}>
      <label className="field inline-field">
        <span>Sort</span>
        <select value={deckSort} onChange={(event) => setDeckSort(event.target.value as DeckSortKey)}>
          <option value="added">Added</option>
          <option value="name">Name</option>
          <option value="manaValue">Cost</option>
          <option value="typeLine">Type</option>
          <option value="quantity">Quantity</option>
        </select>
      </label>
      <label className="field inline-field">
        <span>Group</span>
        <select value={deckGroup} onChange={(event) => setDeckGroup(event.target.value as DeckGroupKey)}>
          <option value="section">Section</option>
          <option value="typeLine">Type</option>
          <option value="manaValue">Cost</option>
          <option value="none">None</option>
        </select>
      </label>
    </div>
  );

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
              ["decks", "Decks"]
            ].map(([tab, label]) => (
              <button
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
            <summary className="header-menu-trigger">Stats</summary>
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
            className={activeTab === "import" ? "tab-button active" : "tab-button"}
            onClick={() => switchTab("import")}
            type="button"
          >
            Import
          </button>
        </div>
      </header>

      {errorMessage ? <div className="banner error">{errorMessage}</div> : null}
      {importMessage ? <div className="banner success">{importMessage}</div> : null}
      {status && status.cards.total === 0 ? (
        <div className="banner warning">
          No Arena catalog is loaded yet. Run <code>npm run db:sync</code> from the project root,
          then refresh the app.
        </div>
      ) : null}

      <main className={activeTab === "search" ? "app-main search-main" : "app-main"}>
        {activeTab === "search" ? (
          <div className={filtersCollapsed ? "search-layout filters-collapsed" : "search-layout"}>
            {!filtersCollapsed ? (
            <aside className="search-sidebar">
              <section className="panel filters-panel">
                <div className="panel-header filters-panel-header">
                  <button
                    className="ghost-button subtle-button cart-button header-cart-button"
                    onClick={() => setDeckDrawerOpen(true)}
                    type="button"
                  >
                    <span className="deck-cart-icon" aria-hidden="true">
                      <span />
                      <span />
                    </span>
                    <span className="cart-button-label">{selectedDeckLabel}</span>
                    <span className="cart-badge">{activeDeckTotalCards}</span>
                  </button>
                  <div className="panel-actions">
                    <button
                      aria-label="Collapse filters"
                      className="ghost-button subtle-button icon-button"
                      onClick={() => setFiltersCollapsed(true)}
                      type="button"
                    >
                      ←
                    </button>
                  </div>
                </div>
                  <>
                    <label className="field">
                      <span>Text</span>
                      <input
                        value={searchState.q}
                        onChange={(event) => setSearchState({ ...searchState, q: event.target.value })}
                        placeholder="Search name or oracle text"
                      />
                    </label>

                    <label className="field">
                      <span>Format</span>
                      <select
                        value={searchState.format}
                        onChange={(event) =>
                          setSearchState({ ...searchState, format: event.target.value as Deck["format"] })
                        }
                      >
                        {FORMATS.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={searchState.ownedOnly ? "inline-toggle toggle-switch active" : "inline-toggle toggle-switch"}>
                      <input
                        className="toggle-switch-input"
                        checked={searchState.ownedOnly}
                        onChange={(event) =>
                          setSearchState({ ...searchState, ownedOnly: event.target.checked })
                        }
                        type="checkbox"
                      />
                      <span className="toggle-switch-track" aria-hidden="true">
                        <span className="toggle-switch-thumb" />
                      </span>
                      <span className="toggle-switch-copy">
                        <strong>Owned cards only</strong>
                        <small>
                          {searchState.ownedOnly ? "Showing only your imported collection" : "Showing the full Arena catalog"}
                        </small>
                      </span>
                    </label>

                    <div className="filter-group">
                      <span>Colors</span>
                      <div className="chip-grid">
                        {COLORS.map((color) => (
                          <button
                            key={color}
                            className={searchState.colors.includes(color) ? "chip active" : "chip"}
                            onClick={() =>
                              setSearchState({
                                ...searchState,
                                colors: toggleValue(searchState.colors, color)
                              })
                            }
                            type="button"
                          >
                            {color}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="filter-group">
                      <span>Types</span>
                      <div className="chip-grid">
                        {CARD_TYPES.map((type) => (
                          <button
                            key={type}
                            className={searchState.types.includes(type) ? "chip active" : "chip"}
                            onClick={() =>
                              setSearchState({
                                ...searchState,
                                types: toggleValue(searchState.types, type)
                              })
                            }
                            type="button"
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <label className="field">
                      <span>Subtype / tribe</span>
                      <input
                        placeholder="Kithkin, Shrine, Angel"
                        value={searchState.subtypes}
                        onChange={(event) =>
                          setSearchState({
                            ...searchState,
                            subtypes: event.target.value
                          })
                        }
                      />
                    </label>

                    <div className="filter-group">
                      <span>Rarity</span>
                      <div className="chip-grid">
                        {RARITIES.map((rarity) => (
                          <button
                            key={rarity}
                            className={searchState.rarity.includes(rarity) ? "chip active" : "chip"}
                            onClick={() =>
                              setSearchState({
                                ...searchState,
                                rarity: toggleValue(searchState.rarity, rarity)
                              })
                            }
                            type="button"
                          >
                            {rarity}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="filter-group">
                      <div className="filter-heading">
                        <span>Mechanics</span>
                        <button
                          className="ghost-button subtle-button"
                          onClick={() => setGlossaryOpen(true)}
                          type="button"
                        >
                          Glossary
                        </button>
                      </div>
                      {selectedMechanics.length ? (
                        <div className="mechanic-section">
                          <span className="mechanic-section-title">Selected</span>
                          <div className="chip-grid">
                            {selectedMechanics.map((mechanic) => (
                              <button
                                key={`selected-${mechanic.slug}`}
                                className="chip active"
                                title={mechanic.definition}
                                onClick={() => toggleMechanic(mechanic.slug)}
                                type="button"
                              >
                                {mechanic.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {sidebarFavorites.length ? (
                        <div className="mechanic-section">
                          <span className="mechanic-section-title">Pinned</span>
                          <div className="chip-grid">
                            {sidebarFavorites.map((mechanic) => (
                              <button
                                key={`favorite-${mechanic.slug}`}
                                className={searchState.mechanics.includes(mechanic.slug) ? "chip active" : "chip"}
                                title={mechanic.definition}
                                onClick={() => toggleMechanic(mechanic.slug)}
                                type="button"
                              >
                                {mechanic.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {sidebarDerivedGroups.map((section) => (
                        <div className="mechanic-section" key={`sidebar-${section.id}`}>
                          <span className="mechanic-section-title">{section.label}</span>
                          <div className="chip-grid mechanic-grid compact-grid">
                            {section.items.map((mechanic) => (
                              <button
                                key={mechanic.slug}
                                className={searchState.mechanics.includes(mechanic.slug) ? "chip active" : "chip"}
                                title={mechanic.definition}
                                onClick={() => toggleMechanic(mechanic.slug)}
                                type="button"
                              >
                                {mechanic.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mana-range">
                      <label className="field">
                        <span>Mana value min</span>
                        <input
                          inputMode="numeric"
                          value={searchState.manaValueMin}
                          onChange={(event) =>
                            setSearchState({ ...searchState, manaValueMin: event.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Mana value max</span>
                        <input
                          inputMode="numeric"
                          value={searchState.manaValueMax}
                          onChange={(event) =>
                            setSearchState({ ...searchState, manaValueMax: event.target.value })
                          }
                        />
                      </label>
                    </div>

                    <button
                      className="ghost-button subtle-button filters-clear"
                      onClick={() => setSearchState(defaultSearch)}
                      type="button"
                    >
                      Clear filters
                    </button>
                  </>
              </section>
            </aside>
            ) : (
              <button
                aria-label="Expand filters"
                className="ghost-button subtle-button search-expand-fab"
                onClick={() => setFiltersCollapsed(false)}
                type="button"
              >
                →
              </button>
            )}

            <section className="panel results-panel">
              <div className="panel-header">
                <div className="results-header-main">
                  <h2>Search Results</h2>
                  <span>
                    {searchLoading
                      ? "Searching..."
                      : `Showing ${Math.min(visibleResultsCount, cards.length)} of ${cardsTotal} matches`}
                  </span>
                </div>
                <div className="view-toggle">
                  {(["grid", "list", "table"] as ResultsViewMode[]).map((mode) => (
                    <button
                      className={viewMode === mode ? "view-button active" : "view-button"}
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      type="button"
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {viewMode === "grid" ? (
                <div className="results-grid">
                  {visibleCards.map((card) => (
                    <article className="card-tile" key={card.id}>
                      <ColorStrip colors={getCardAccentColors(card)} />
                      <div className="card-tile-body">
                        <div className="card-tile-header">
                          <div>
                            <h3>{card.name}</h3>
                            <p>{card.typeLine}</p>
                          </div>
                          <div className="card-corner">
                            <CardCornerVisual card={card} />
                            <OwnershipDots card={card} />
                          </div>
                        </div>
                        <p className="rules-text">
                          <RenderOraclePreview text={card.oracleText} />
                        </p>
                        <div className="tag-row">
                          {card.mechanics.slice(0, 6).map((mechanic) => (
                            <span className={`tag ${mechanic.type}`} key={mechanic.slug} title={mechanic.definition}>
                              {mechanic.label}
                            </span>
                          ))}
                        </div>
                        <div className="card-meta">
                          <CardMetaSummary card={card} />
                        </div>
                        <div className="card-actions">{renderActions(card)}</div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {viewMode === "list" ? (
                <div className="results-list">
                  {visibleCards.map((card) => (
                    <article className="result-row" key={card.id}>
                      <ColorStrip colors={getCardAccentColors(card)} />
                      <div className="result-row-body">
                        <div className="result-row-main">
                          <div className="result-row-title">
                            <strong>{card.name}</strong>
                            <span>{card.typeLine}</span>
                          </div>
                          <div className="result-row-oracle">
                            <RenderOraclePreview className="oracle-preview" text={card.oracleText} />
                          </div>
                          <div className="result-row-footer">
                            <div className="card-meta">
                              <CardMetaSummary card={card} />
                            </div>
                            <div className="list-mechanics">{getMechanicSummary(card, 4) || "No indexed mechanics"}</div>
                          </div>
                        </div>
                        <div className="result-row-side">
                          <CardCornerVisual card={card} compactLand />
                          <OwnershipDots card={card} />
                          <div className="card-actions compact-actions">{renderActions(card)}</div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {viewMode === "table" ? (
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>
                          <button className="table-sort" onClick={() => toggleTableSort("name")} type="button">
                            Name
                          </button>
                        </th>
                        <th>
                          <button className="table-sort table-sort-center" onClick={() => toggleTableSort("manaCost")} type="button">
                            Cost
                          </button>
                        </th>
                        <th>
                          <button className="table-sort table-sort-center" onClick={() => toggleTableSort("manaValue")} type="button">
                            MV
                          </button>
                        </th>
                        <th>
                          <button className="table-sort" onClick={() => toggleTableSort("typeLine")} type="button">
                            Type
                          </button>
                        </th>
                        <th>
                          <button className="table-sort table-sort-center" onClick={() => toggleTableSort("ownedCount")} type="button">
                            Playable
                          </button>
                        </th>
                        <th>
                          <button className="table-sort table-sort-center" onClick={() => toggleTableSort("rawOwnedCount")} type="button">
                            Raw
                          </button>
                        </th>
                        <th>
                          <button className="table-sort" onClick={() => toggleTableSort("set")} type="button">
                            Set
                          </button>
                        </th>
                        <th>
                          <button className="table-sort" onClick={() => toggleTableSort("rarity")} type="button">
                            Rarity
                          </button>
                        </th>
                        <th>
                          <button className="table-sort" onClick={() => toggleTableSort("mechanics")} type="button">
                            Mechanics
                          </button>
                        </th>
                        <th className="table-head-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleSortedCards.map((card) => (
                        <tr key={`table-${card.id}`}>
                          <td>
                            <button className="table-card-trigger table-name table-name-accent" onClick={() => void openCardDetail(card)} type="button">
                              <VerticalColorStrip colors={getCardAccentColors(card)} />
                              <strong>{card.name}</strong>
                              <span>{card.typeLine}</span>
                            </button>
                          </td>
                          <td className="table-cell-center table-cell-graphic">
                            <CardCornerVisual card={card} compactLand />
                          </td>
                          <td className="table-cell-center">{card.manaValue}</td>
                          <td>{card.typeLine}</td>
                          <td className="table-cell-center">{card.deckBuildingLimit === null ? "∞" : card.ownedCount}</td>
                          <td className="table-cell-center">{card.rawOwnedCount}</td>
                          <td>{card.preferredSetCode ?? "SET"}</td>
                          <td>{card.rarity}</td>
                          <td>{getMechanicSummary(card, 3) || "None"}</td>
                          <td className="table-cell-center table-cell-actions">
                            <div className="card-actions table-actions">{renderActions(card)}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {!searchLoading && cards.length > 0 ? (
                <div className="results-footer">
                  <span className="results-summary">
                    Loaded {cards.length.toLocaleString()} result{cards.length === 1 ? "" : "s"}
                    {cardsTotal > cards.length ? ` of ${cardsTotal.toLocaleString()} total` : ""}
                  </span>
                  <div className="results-actions">
                    {visibleResultsCount < cards.length ? (
                      <button
                        className="ghost-button subtle-button"
                        onClick={() =>
                          setVisibleResultsCount((current) => Math.min(current + VISIBLE_RESULTS_STEP, cards.length))
                        }
                        type="button"
                      >
                        Show {Math.min(VISIBLE_RESULTS_STEP, cards.length - visibleResultsCount)} more
                      </button>
                    ) : null}
                    {visibleResultsCount < cards.length ? (
                      <button
                        className="ghost-button subtle-button"
                        onClick={() => setVisibleResultsCount(cards.length)}
                        type="button"
                      >
                        Show all loaded
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {activeTab === "decks" ? (
          <div className="workspace-grid">
            <section className="panel deck-list-panel">
              <div className="panel-header">
                <h2>Decks</h2>
                <span>{deckList.length} saved</span>
              </div>

              <div className="deck-creator">
                <label className="field">
                  <span>Name</span>
                  <input value={deckName} onChange={(event) => setDeckName(event.target.value)} />
                </label>
                <label className="field">
                  <span>Format</span>
                  <select
                    value={deckFormat}
                    onChange={(event) => setDeckFormat(event.target.value as Deck["format"])}
                  >
                    {FORMATS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button" onClick={handleCreateDeck} type="button">
                  Create deck
                </button>
              </div>

              <div className="deck-list">
                {deckList.map((deck) => (
                  <button
                    className={activeDeck?.id === deck.id ? "deck-list-item active" : "deck-list-item"}
                    key={deck.id}
                    onClick={() => handleSelectDeck(deck.id)}
                    type="button"
                  >
                    <strong>{deck.name}</strong>
                    <span>{FORMATS.find(([value]) => value === deck.format)?.[1] ?? deck.format}</span>
                    <small>{deck.totalCards} cards</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel deck-detail-panel">
              {activeDeck ? (
                <>
                  <div className="panel-header">
                    <div>
                      <h2>{activeDeck.name}</h2>
                      <span>{FORMATS.find(([value]) => value === activeDeck.format)?.[1]}</span>
                    </div>
                    <button className="ghost-button" onClick={() => void saveDeck(activeDeck)} type="button">
                      Save deck
                    </button>
                  </div>

                  <label className="field">
                    <span>Deck name</span>
                    <input
                      value={activeDeck.name}
                      onChange={(event) =>
                        setActiveDeck({
                          ...activeDeck,
                          name: event.target.value
                        })
                      }
                    />
                  </label>

                  <label className="field">
                    <span>Notes</span>
                    <textarea
                      rows={3}
                      value={activeDeck.notes}
                      onChange={(event) =>
                        setActiveDeck({
                          ...activeDeck,
                          notes: event.target.value
                        })
                      }
                    />
                  </label>

                  {renderDeckDisplayControls()}

                  <div className="deck-card-list">
                    {sortedDeckDisplayCards.length === 0 ? (
                      <p className="empty-state">
                        Start from the Search tab and add cards into this deck.
                      </p>
                    ) : (
                      deckCardGroups.map((group) => (
                        <section className="deck-group" key={`detail-group-${group.key}`}>
                          {deckGroup !== "none" ? (
                            <div className="deck-group-header">
                              <strong>{group.label}</strong>
                              <span>{group.items.reduce((total, item) => total + item.quantity, 0)} cards</span>
                            </div>
                          ) : null}
                          {group.items.map((deckCard) => (
                            <div className="deck-card-row" key={`${deckCard.cardId}-${deckCard.section}`}>
                              <div className="cart-card-copy">
                                <strong>{deckCard.displayName}</strong>
                                <p>
                                  {deckCard.section}
                                  {deckCard.displayTypeLine ? ` · ${deckCard.displayTypeLine}` : ""}
                                  {typeof deckCard.displayOwnedCount === "number" ? ` · own ${deckCard.displayOwnedCount}` : ""}
                                </p>
                              </div>
                              <div className="quantity-controls">
                                <button
                                  onClick={() =>
                                    handleChangeDeckQuantity(deckCard.cardId, deckCard.section, -1)
                                  }
                                  type="button"
                                >
                                  -
                                </button>
                                <span>{deckCard.quantity}</span>
                                <button
                                  onClick={() =>
                                    handleChangeDeckQuantity(deckCard.cardId, deckCard.section, 1)
                                  }
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

                  <div className="validation-grid">
                    <div className="subpanel">
                      <div className="panel-header">
                        <h3>Validation</h3>
                        <button
                          className="ghost-button"
                          onClick={async () => {
                            if (!activeDeck) {
                              return;
                            }
                            setValidation(await validateDeck(activeDeck.id));
                          }}
                          type="button"
                        >
                          Refresh
                        </button>
                      </div>
                      {validation?.issues.length ? (
                        <ul className="issue-list">
                          {validation.issues.map((issue: string) => (
                            <li key={issue}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">No validation issues yet.</p>
                      )}
                    </div>

                    <div className="subpanel">
                      <div className="panel-header">
                        <h3>Ownership gaps</h3>
                        <button
                          className="ghost-button"
                          onClick={async () => {
                            if (!activeDeck) {
                              return;
                            }
                            const arenaExport = await exportDeck(activeDeck.id);
                            setExportText(arenaExport.text);
                          }}
                          type="button"
                        >
                          Refresh export
                        </button>
                      </div>
                      {validation?.ownershipGaps.length ? (
                        <ul className="issue-list">
                          {validation.ownershipGaps.map((gap: ValidationResult["ownershipGaps"][number]) => (
                            <li key={gap.cardId}>
                              {gap.name}: need {gap.needed}, own {gap.owned}, missing {gap.missing}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">No ownership gaps for the current list.</p>
                      )}
                    </div>
                  </div>

                  <div className="subpanel export-panel">
                    <div className="panel-header">
                      <h3>Arena Export</h3>
                    </div>
                    <textarea readOnly rows={12} value={exportText} />
                  </div>
                </>
              ) : (
                <p className="empty-state">Create a deck to start building.</p>
              )}
            </section>
          </div>
        ) : null}

        {activeTab === "import" ? (
          <div className="workspace-grid import-workspace">
            <section className="panel import-panel snapshot-panel">
              <div className="panel-header">
                <h2>Current Snapshot</h2>
                <span>Collection status</span>
              </div>
              <div className="snapshot-grid">
                <div className="stat-card dense">
                  <span>Stored entries</span>
                  <strong>{status?.collection.ownedEntries ?? 0}</strong>
                </div>
                <div className="stat-card dense">
                  <span>Unique names</span>
                  <strong>{status?.collection.uniqueNames ?? 0}</strong>
                </div>
                <div className="stat-card dense">
                  <span>Owned copies</span>
                  <strong>{status?.collection.ownedCopies ?? 0}</strong>
                </div>
                <div className="stat-card dense">
                  <span>Owned rows</span>
                  <strong>{status?.collection.importRowsWithCopies ?? 0}</strong>
                </div>
                <div className="stat-card dense">
                  <span>Unresolved rows</span>
                  <strong>{status?.collection.unresolvedEntries ?? 0}</strong>
                </div>
                <div className="stat-card dense">
                  <span>Imported at</span>
                  <strong>{formatDateTime(status?.collection.importedAt ?? null)}</strong>
                </div>
              </div>
            </section>

            <div className="import-stack">
              <section className="panel import-panel">
                <div className="panel-header">
                  <h2>Untapped Companion</h2>
                  <span>Safe bridge import</span>
                </div>

                <p className="hero-copy">
                  Capture a local <code>mtga.collection</code> JSON dump from Untapped Companion,
                  preview it here, then replace your current collection snapshot.
                </p>

                <div className="helper-toolbar">
                  <button
                    className="primary-button"
                    disabled={untappedHelperLoading}
                    onClick={handleStartUntappedGuide}
                    type="button"
                  >
                    {untappedHelperLoading ? "Starting..." : "Start guided capture"}
                  </button>
                  <button className="ghost-button" onClick={handleCopyUntappedSnippet} type="button">
                    Copy snippet
                  </button>
                  <button
                    className="ghost-button"
                    disabled={!untappedHelperStatus?.latestCapture || untappedPreviewLoading}
                    onClick={handlePreviewLatestUntappedCapture}
                    type="button"
                  >
                    Preview latest download
                  </button>
                  <button
                    className="ghost-button"
                    disabled={untappedHelperLoading || !untappedHelperStatus?.showDevTools}
                    onClick={handleStopUntappedGuide}
                    type="button"
                  >
                    Stop guided capture
                  </button>
                </div>

                <p className="helper-note">
                  Guided mode enables Untapped DevTools, watches your Downloads folder, and previews
                  the next capture automatically after the JSON download finishes.
                </p>

                {untappedHelperStatus ? (
                  <div className="subpanel helper-status-panel">
                    <div className="panel-header">
                      <h3>Local helper status</h3>
                      <span>{untappedGuideActive ? "Watching for new captures" : "Idle"}</span>
                    </div>
                    <div className="snapshot-grid helper-status-grid">
                      <div className="stat-card dense">
                        <span>DevTools</span>
                        <strong>{untappedHelperStatus.showDevTools ? "Enabled" : "Disabled"}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Helper</span>
                        <strong>{untappedHelperStatus.available ? "Ready" : "Unavailable"}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Latest capture</span>
                        <strong>{untappedHelperStatus.latestCapture ? untappedHelperStatus.latestCapture.filename : "None yet"}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Updated</span>
                        <strong>
                          {untappedHelperStatus.latestCapture
                            ? formatDateTime(untappedHelperStatus.latestCapture.modifiedAt)
                            : "Waiting"}
                        </strong>
                      </div>
                    </div>

                    <div className="helper-path-list">
                      <p>
                        <strong>Downloads:</strong> <code>{untappedHelperStatus.downloadsPath}</code>
                      </p>
                      <p>
                        <strong>Config:</strong> <code>{untappedHelperStatus.configPath}</code>
                      </p>
                      {untappedHelperStatus.latestCapture ? (
                        <p>
                          <strong>Latest file:</strong> <code>{untappedHelperStatus.latestCapture.path}</code> (
                          {formatFileSize(untappedHelperStatus.latestCapture.size)})
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <ol className="import-steps">
                  <li>Open Untapped Companion and MTGA Deck Builder.</li>
                  <li>Open Untapped DevTools and run this console snippet.</li>
                  <li>Wait for the download or upload the JSON manually if the watcher misses it.</li>
                </ol>

                <pre className="capture-snippet">
                  <code>{untappedHelperStatus?.snippet ?? UNTAPPED_CAPTURE_SNIPPET}</code>
                </pre>

                <label className="upload-drop">
                  <input accept=".json,application/json" onChange={handleUntappedPreview} type="file" />
                  <span>{untappedFile ? untappedFile.name : "Choose your Untapped collection JSON"}</span>
                  <small>
                    Raw <code>grpId -&gt; quantity</code> map exported from the Untapped renderer.
                  </small>
                </label>

                {untappedPreviewLoading ? (
                  <p className="empty-state">Previewing Untapped collection...</p>
                ) : null}

                {untappedPreview ? (
                  <div className="untapped-preview">
                    <div className="panel-header preview-header">
                      <div>
                        <h3>Preview</h3>
                        <span>
                          {formatCatalogLabel(untappedPreview)}
                          {untappedPreviewSource === "latest-capture" && untappedHelperStatus?.latestCapture
                            ? ` · ${untappedHelperStatus.latestCapture.filename}`
                            : ""}
                        </span>
                      </div>
                      <button
                        className="primary-button"
                        disabled={untappedImporting}
                        onClick={handleConfirmUntappedImport}
                        type="button"
                      >
                        {untappedImporting ? "Importing..." : "Confirm import"}
                      </button>
                    </div>

                    <div className="snapshot-grid import-preview-grid">
                      <div className="stat-card dense">
                        <span>Owned titles</span>
                        <strong>{untappedPreview.ownedTitles}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Playable copies</span>
                        <strong>{untappedPreview.ownedCopies}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Variant copies</span>
                        <strong>{untappedPreview.rawOwnedCopies}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Matched grpIds</span>
                        <strong>{untappedPreview.matchedGrpIds}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Unmatched grpIds</span>
                        <strong>{untappedPreview.unmatchedGrpIds}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Extracted path</span>
                        <strong>{untappedPreview.extractedPath}</strong>
                      </div>
                    </div>

                    <div className="snapshot-grid import-diff-grid">
                      <div className="stat-card dense">
                        <span>Added titles</span>
                        <strong>{untappedPreview.diff.addedTitles}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Removed titles</span>
                        <strong>{untappedPreview.diff.removedTitles}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Changed titles</span>
                        <strong>{untappedPreview.diff.changedTitles}</strong>
                      </div>
                      <div className="stat-card dense">
                        <span>Unchanged titles</span>
                        <strong>{untappedPreview.diff.unchangedTitles}</strong>
                      </div>
                    </div>

                    {untappedPreview.unresolvedCards.length ? (
                      <div className="subpanel import-warning-panel">
                        <div className="panel-header">
                          <h3>Unresolved local matches</h3>
                          <span>{untappedPreview.unresolvedCards.length}</span>
                        </div>
                        <ul className="issue-list">
                          {untappedPreview.unresolvedCards.slice(0, 6).map((entry) => (
                            <li key={entry.name}>
                              {entry.name}: {entry.titleCount} playable, {entry.printCount} variant copies
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {untappedPreview.unmatchedEntries.length ? (
                      <div className="subpanel import-warning-panel">
                        <div className="panel-header">
                          <h3>Catalog misses</h3>
                          <span>{untappedPreview.unmatchedEntries.length}</span>
                        </div>
                        <ul className="issue-list">
                          {untappedPreview.unmatchedEntries.slice(0, 6).map((entry) => (
                            <li key={entry.grpId}>
                              grpId {entry.grpId}: qty {entry.quantity}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>

              <section className="panel import-panel">
                <div className="panel-header">
                  <h2>Collection CSV</h2>
                  <span>Fallback import</span>
                </div>

                <p className="hero-copy">
                  Upload an MTG Arena collection export. The new file replaces the current ownership
                  snapshot atomically.
                </p>

                <label className="upload-drop">
                  <input accept=".csv,text/csv" onChange={handleImport} type="file" />
                  <span>Choose your Arena collection CSV</span>
                  <small>Required columns: Id, Name, Set, Color, Rarity, Count, PrintCount</small>
                </label>
              </section>
            </div>
          </div>
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
                  {renderDeckDisplayControls(true)}
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
                                {typeof deckCard.displayOwnedCount === "number" ? ` · own ${deckCard.displayOwnedCount}` : ""}
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
