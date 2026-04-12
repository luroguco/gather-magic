import type { CollectionImportSummary } from "../../types";

type CollectionImportPreviewProps = {
  preview: CollectionImportSummary;
  importing: boolean;
  onConfirm: () => void;
  formatImportPreviewContext: (preview: CollectionImportSummary) => string;
  formatDateTime: (value: string | null) => string;
  contextSuffix?: string | undefined;
};

export function CollectionImportPreview({
  preview,
  importing,
  onConfirm,
  formatImportPreviewContext,
  formatDateTime,
  contextSuffix
}: CollectionImportPreviewProps) {
  return (
    <div className="untapped-preview">
      <div className="panel-header preview-header">
        <div>
          <h3>Preview</h3>
          <span>
            {formatImportPreviewContext(preview)}
            {contextSuffix ? ` · ${contextSuffix}` : ""}
          </span>
        </div>
        <button className="primary-button" disabled={importing} onClick={onConfirm} type="button">
          {importing ? "Importing..." : "Confirm import"}
        </button>
      </div>

      <div className="snapshot-grid import-preview-grid">
        <div className="stat-card dense">
          <span>Owned titles</span>
          <strong>{preview.ownedTitles}</strong>
        </div>
        <div className="stat-card dense">
          <span>Playable copies</span>
          <strong>{preview.ownedCopies}</strong>
        </div>
        <div className="stat-card dense">
          <span>Variant copies</span>
          <strong>{preview.rawOwnedCopies}</strong>
        </div>
        <div className="stat-card dense">
          <span>Matched grpIds</span>
          <strong>{preview.matchedGrpIds}</strong>
        </div>
        <div className="stat-card dense">
          <span>Unmatched grpIds</span>
          <strong>{preview.unmatchedGrpIds}</strong>
        </div>
        <div className="stat-card dense">
          <span>Extracted path</span>
          <strong>{preview.extractedPath}</strong>
        </div>
        {preview.snapshotMetadata?.capturedAt ? (
          <div className="stat-card dense">
            <span>Captured at</span>
            <strong>{formatDateTime(preview.snapshotMetadata.capturedAt)}</strong>
          </div>
        ) : null}
        {preview.snapshotMetadata?.collectorVersion ? (
          <div className="stat-card dense">
            <span>Collector</span>
            <strong>{preview.snapshotMetadata.collectorVersion}</strong>
          </div>
        ) : null}
      </div>

      <div className="snapshot-grid import-diff-grid">
        <div className="stat-card dense">
          <span>Added titles</span>
          <strong>{preview.diff.addedTitles}</strong>
        </div>
        <div className="stat-card dense">
          <span>Removed titles</span>
          <strong>{preview.diff.removedTitles}</strong>
        </div>
        <div className="stat-card dense">
          <span>Changed titles</span>
          <strong>{preview.diff.changedTitles}</strong>
        </div>
        <div className="stat-card dense">
          <span>Unchanged titles</span>
          <strong>{preview.diff.unchangedTitles}</strong>
        </div>
      </div>

      {preview.unresolvedCards.length ? (
        <div className="subpanel import-warning-panel">
          <div className="panel-header">
            <h3>Unresolved local matches</h3>
            <span>{preview.unresolvedCards.length}</span>
          </div>
          <ul className="issue-list">
            {preview.unresolvedCards.slice(0, 6).map((entry) => (
              <li key={entry.name}>
                {entry.name}: {entry.titleCount} playable, {entry.printCount} variant copies
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview.unmatchedEntries.length ? (
        <div className="subpanel import-warning-panel">
          <div className="panel-header">
            <h3>Catalog misses</h3>
            <span>{preview.unmatchedEntries.length}</span>
          </div>
          <ul className="issue-list">
            {preview.unmatchedEntries.slice(0, 6).map((entry) => (
              <li key={entry.grpId}>
                grpId {entry.grpId}: qty {entry.quantity}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
