import { useState } from "react";

import type {
  CardSummary,
  Deck,
  DeckCard,
  DeckListItem,
  ValidationResult
} from "../../types";

export type DeckSortKey =
  | "added"
  | "name"
  | "manaValue"
  | "typeLine"
  | "quantity";
export type DeckGroupKey = "none" | "section" | "typeLine" | "manaValue";

export type PendingDeckAdd = {
  card: CardSummary;
  section: DeckCard["section"];
};

export const useDeckWorkspace = () => {
  const [deckList, setDeckList] = useState<DeckListItem[]>([]);
  const [activeDeck, setActiveDeck] = useState<Deck | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [exportText, setExportText] = useState("");
  const [deckName, setDeckName] = useState("New Arena Deck");
  const [deckFormat, setDeckFormat] = useState<Deck["format"]>("standard");
  const [quickDeckName, setQuickDeckName] = useState("Search Deck");
  const [quickDeckFormat, setQuickDeckFormat] =
    useState<Deck["format"]>("standard");
  const [deckDrawerOpen, setDeckDrawerOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingDeckAdd | null>(null);
  const [deckTargetMenuOpen, setDeckTargetMenuOpen] = useState(false);
  const [drawerCreateMode, setDrawerCreateMode] = useState(false);
  const [deckSort, setDeckSort] = useState<DeckSortKey>("added");
  const [deckGroup, setDeckGroup] = useState<DeckGroupKey>("section");

  return {
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
  };
};
