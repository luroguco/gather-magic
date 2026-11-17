import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CollectionCsvPreview } from "../../types";
import { CollectionImportPreview } from "./CollectionImportPreview";

const suspiciousPreview: CollectionCsvPreview = {
  source: "collection-csv",
  rowsRead: 5,
  cardsMatched: 5,
  ownedTitles: 5,
  ownedCopies: 8,
  rawOwnedCopies: 8,
  unresolvedRows: [],
  diff: {
    addedTitles: 0,
    removedTitles: 15,
    changedTitles: 0,
    unchangedTitles: 5
  }
};

describe("CollectionImportPreview", () => {
  it("requires an acknowledgement for a suspicious replacement", () => {
    const onConfirm = vi.fn();
    render(
      <CollectionImportPreview
        currentOwnedCopies={24}
        formatDateTime={(value) => value ?? "Never"}
        importing={false}
        onCancel={() => undefined}
        onConfirm={onConfirm}
        preview={suspiciousPreview}
      />
    );

    const replaceButton = screen.getByRole("button", {
      name: "Replace current collection"
    });
    expect(replaceButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Large change detected/
      })
    );
    expect(replaceButton).toBeEnabled();

    fireEvent.click(replaceButton);
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("shows a completed state instead of another import action", () => {
    render(
      <CollectionImportPreview
        currentOwnedCopies={8}
        formatDateTime={(value) => value ?? "Never"}
        importing={false}
        onCancel={() => undefined}
        onConfirm={() => undefined}
        preview={{
          ...suspiciousPreview,
          importedAt: "2026-07-24T03:00:00.000Z"
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "Collection updated" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Replace current collection" })
    ).not.toBeInTheDocument();
  });
});
