import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Deck } from "../../types";
import { DecksScreen } from "./DecksScreen";

const deck: Deck = {
  id: "deck-1",
  name: "Arena Deck",
  format: "standard",
  notes: "",
  createdAt: "2026-07-27T00:00:00.000Z",
  updatedAt: "2026-07-27T00:00:00.000Z",
  source: "arena",
  externalId: "arena-deck-1",
  sourceFormat: "Standard",
  sourceUpdatedAt: "2026-07-27T00:00:00.000Z",
  lastPlayedAt: null,
  isFavorite: false,
  cards: []
};

describe("DecksScreen Arena export", () => {
  it("shows the Arena code and copies the exact payload", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const exportText = "Deck\n2 Angelic Blink (TST) 1";

    render(
      <DecksScreen
        deckList={[
          {
            ...deck,
            cardRows: 0,
            totalCards: 0
          }
        ]}
        activeDeck={deck}
        deckName="New Arena Deck"
        deckFormat="standard"
        onDeckNameChange={vi.fn()}
        onDeckFormatChange={vi.fn()}
        onCreateDeck={vi.fn()}
        onSelectDeck={vi.fn()}
        onSaveDeck={vi.fn()}
        validation={null}
        onRefreshValidation={vi.fn().mockResolvedValue(undefined)}
        exportText={exportText}
        deckSort="added"
        deckGroup="section"
        onDeckSortChange={vi.fn()}
        onDeckGroupChange={vi.fn()}
        sortedDeckDisplayCards={[]}
        deckCardGroups={[]}
        onChangeDeckQuantity={vi.fn()}
        onActiveDeckChange={vi.fn()}
        arenaDeckPreview={null}
        arenaDeckPreviewLoading={false}
        arenaDeckSyncing={false}
        includeStarterDecks={false}
        onIncludeStarterDecksChange={vi.fn()}
        onPreviewArenaDecks={vi.fn()}
        onSyncArenaDecks={vi.fn()}
        bulkExportLoading={false}
        bulkExportStatus="idle"
        onCopyAllDecks={vi.fn()}
        onDownloadAllDecks={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Arena export code")).toHaveValue(exportText);
    fireEvent.click(screen.getByRole("button", { name: "Export deck" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(exportText));
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
