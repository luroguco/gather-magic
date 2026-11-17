import { useEffect, useRef, useState } from "react";
import { isCollectorCatalogMatchSafe } from "@mtga/contracts";

import type {
  CollectionCsvPreview,
  CollectionDiff,
  CollectionImportSummary
} from "../../types";

export type CollectionReviewPreview = CollectionImportSummary | CollectionCsvPreview;

type CollectionImportPreviewProps = {
  preview: CollectionReviewPreview;
  currentOwnedCopies: number | null;
  importing: boolean;
  onConfirm: (confirmSuspiciousDiff: boolean) => void;
  onCancel: () => void;
  formatDateTime: (value: string | null) => string;
  contextSuffix?: string | undefined;
};

const isCsvPreview = (preview: CollectionReviewPreview): preview is CollectionCsvPreview =>
  preview.source === "collection-csv";

const isSuspiciousDiff = (diff: CollectionDiff) => {
  const currentTitles = diff.changedTitles + diff.unchangedTitles + diff.removedTitles;
  const materiallyChangedTitles = diff.changedTitles + diff.removedTitles;
  return (
    currentTitles >= 20 &&
    (diff.removedTitles >= Math.ceil(currentTitles * 0.25) ||
      materiallyChangedTitles >= Math.ceil(currentTitles * 0.5))
  );
};

const getSourceLabel = (preview: CollectionReviewPreview) => {
  if (preview.source === "collection-csv") {
    return "Arena CSV";
  }
  return preview.source === "collector-snapshot" ? "MTG Arena" : "Untapped Companion";
};

export function CollectionImportPreview({
  preview,
  currentOwnedCopies,
  importing,
  onConfirm,
  onCancel,
  formatDateTime,
  contextSuffix
}: CollectionImportPreviewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const completed = Boolean(preview.importedAt);
  const suspicious = isSuspiciousDiff(preview.diff);
  const previousTitles =
    preview.diff.changedTitles + preview.diff.unchangedTitles + preview.diff.removedTitles;
  const unresolvedCount = isCsvPreview(preview)
    ? preview.unresolvedRows.length
    : preview.unresolvedCards.length + preview.unmatchedEntries.length;
  const collectorCatalogMismatch =
    !isCsvPreview(preview) &&
    preview.source === "collector-snapshot" &&
    !isCollectorCatalogMatchSafe(preview);

  useEffect(() => {
    setRiskAcknowledged(false);
    headingRef.current?.focus();
  }, [preview]);

  return (
    <section
      aria-label={completed ? "Collection update complete" : "Collection update preview"}
      className="collection-review"
    >
      <div className="panel-header preview-header">
        <div>
          <h3 ref={headingRef} tabIndex={-1}>
            {completed ? "Collection updated" : "Review changes"}
          </h3>
          <span>
            {getSourceLabel(preview)}
            {contextSuffix ? ` · ${contextSuffix}` : ""}
            {preview.importedAt ? ` · ${formatDateTime(preview.importedAt)}` : ""}
            {!preview.importedAt &&
            !isCsvPreview(preview) &&
            preview.snapshotMetadata?.capturedAt
              ? ` · Captured ${formatDateTime(preview.snapshotMetadata.capturedAt)}`
              : ""}
          </span>
        </div>
        {completed ? <span className="status-badge success">Complete</span> : null}
      </div>

      {completed ? (
        <div className="import-complete-callout" role="status">
          The replacement finished successfully. You can restore an earlier version from Update
          history below.
        </div>
      ) : (
        <p className="review-assurance">
          Nothing has been replaced yet. Review the totals and warnings before continuing.
        </p>
      )}

      <div className="collection-comparison" aria-label="Current and proposed collection totals">
        {!completed ? (
          <div className="comparison-column">
            <span>Current collection</span>
            <strong>{previousTitles.toLocaleString()} cards</strong>
            <small>
              {currentOwnedCopies === null
                ? "Copy count unavailable"
                : `${currentOwnedCopies.toLocaleString()} copies`}
            </small>
          </div>
        ) : null}
        <div className="comparison-arrow" aria-hidden="true">
          {completed ? "✓" : "→"}
        </div>
        <div className="comparison-column proposed">
          <span>{completed ? "Updated collection" : "After replacement"}</span>
          <strong>{preview.ownedTitles.toLocaleString()} cards</strong>
          <small>{preview.ownedCopies.toLocaleString()} copies</small>
        </div>
      </div>

      <div className="import-diff-summary">
        <div>
          <span>Added</span>
          <strong>+{preview.diff.addedTitles.toLocaleString()}</strong>
        </div>
        <div className={preview.diff.removedTitles > 0 ? "has-warning" : ""}>
          <span>Removed</span>
          <strong>−{preview.diff.removedTitles.toLocaleString()}</strong>
        </div>
        <div>
          <span>Changed</span>
          <strong>{preview.diff.changedTitles.toLocaleString()}</strong>
        </div>
        <div className={unresolvedCount > 0 ? "has-warning" : ""}>
          <span>Couldn’t identify</span>
          <strong>{unresolvedCount.toLocaleString()}</strong>
        </div>
      </div>

      {isCsvPreview(preview) && preview.unresolvedRows.length ? (
        <div className="subpanel import-warning-panel">
          <div className="panel-header">
            <h3>Cards needing review</h3>
            <span>{preview.unresolvedRows.length.toLocaleString()}</span>
          </div>
          <p>
            These cards will be kept as local entries, but they could not be matched to the card
            catalog.
          </p>
          <ul className="issue-list">
            {preview.unresolvedRows.slice(0, 6).map((entry, index) => (
              <li key={`${entry.Id}-${entry.Name}-${index}`}>
                {entry.Name} · {entry.Set}
              </li>
            ))}
          </ul>
          {preview.unresolvedRows.length > 6 ? (
            <small>Plus {preview.unresolvedRows.length - 6} more.</small>
          ) : null}
        </div>
      ) : null}

      {!isCsvPreview(preview) && preview.unresolvedCards.length ? (
        <div className="subpanel import-warning-panel">
          <div className="panel-header">
            <h3>Cards needing review</h3>
            <span>{preview.unresolvedCards.length.toLocaleString()}</span>
          </div>
          <p>
            These cards will be kept as local entries, but they could not be matched to the card
            catalog.
          </p>
          <ul className="issue-list">
            {preview.unresolvedCards.slice(0, 6).map((entry) => (
              <li key={entry.name}>
                {entry.name} · {entry.titleCount.toLocaleString()} copies
              </li>
            ))}
          </ul>
          {preview.unresolvedCards.length > 6 ? (
            <small>Plus {preview.unresolvedCards.length - 6} more.</small>
          ) : null}
        </div>
      ) : null}

      {!isCsvPreview(preview) && preview.unmatchedEntries.length ? (
        <div className="subpanel import-warning-panel">
          <div className="panel-header">
            <h3>Unknown source entries</h3>
            <span>{preview.unmatchedEntries.length.toLocaleString()}</span>
          </div>
          <p>
            These source entries are not in the current catalog and will not appear in the
            collection.
          </p>
        </div>
      ) : null}

      {!completed && collectorCatalogMismatch ? (
        <div className="subpanel import-warning-panel" role="alert">
          <div className="panel-header">
            <h3>Card catalog needs updating</h3>
            <span>Import blocked</span>
          </div>
          <p>
            Too few Arena entries matched the local card catalog to replace the collection safely.
            Sync card data, then read the collection from Arena again.
          </p>
        </div>
      ) : null}

      <details className="technical-details">
        <summary>Technical details</summary>
        <dl className="technical-details-grid">
          {isCsvPreview(preview) ? (
            <>
              <div>
                <dt>Rows read</dt>
                <dd>{preview.rowsRead.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Stored cards</dt>
                <dd>{preview.cardsMatched.toLocaleString()}</dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>Source entries</dt>
                <dd>{preview.rawEntryCount.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Catalog matches</dt>
                <dd>{preview.matchedGrpIds.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Catalog misses</dt>
                <dd>{preview.unmatchedGrpIds.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Extracted from</dt>
                <dd>{preview.extractedPath}</dd>
              </div>
              {preview.snapshotMetadata?.capturedAt ? (
                <div>
                  <dt>Captured</dt>
                  <dd>{formatDateTime(preview.snapshotMetadata.capturedAt)}</dd>
                </div>
              ) : null}
            </>
          )}
          <div>
            <dt>Unchanged cards</dt>
            <dd>{preview.diff.unchangedTitles.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Variant copies</dt>
            <dd>{preview.rawOwnedCopies.toLocaleString()}</dd>
          </div>
        </dl>
      </details>

      {!completed && suspicious ? (
        <label className="risk-acknowledgement">
          <input
            checked={riskAcknowledged}
            onChange={(event) => setRiskAcknowledged(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Large change detected.</strong> I understand this will remove{" "}
            {preview.diff.removedTitles.toLocaleString()} cards and materially change{" "}
            {preview.diff.changedTitles.toLocaleString()} more.
          </span>
        </label>
      ) : null}

      {!completed ? (
        <div className="review-actions">
          <button className="ghost-button" disabled={importing} onClick={onCancel} type="button">
            Back
          </button>
          <button
            className="primary-button replace-collection-button"
            disabled={
              importing ||
              collectorCatalogMismatch ||
              (suspicious && !riskAcknowledged)
            }
            onClick={() => onConfirm(suspicious && riskAcknowledged)}
            type="button"
          >
            {importing ? "Replacing collection..." : "Replace current collection"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
