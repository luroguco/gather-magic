import { useState } from "react";

import type {
  AppStatus,
  CollectionCsvPreview,
  CollectionImportHistoryItem,
  CollectionImportSummary,
  CollectorCaptureImportSummary,
  CollectorCaptureStatus,
  UntappedCaptureImportSummary,
  UntappedImportSummary,
  UntappedCaptureStatus
} from "../../types";
import { CollectionImportPreview } from "./CollectionImportPreview";

type ImportMethod = "csv" | "untapped" | "collector";

type ImportScreenProps = {
  status: AppStatus | null;
  importMessage: string;
  errorMessage: string;
  formatDateTime: (value: string | null) => string;
  formatFileSize: (size: number) => string;
  csvFile: File | null;
  csvPreview: CollectionCsvPreview | null;
  csvPreviewLoading: boolean;
  csvImporting: boolean;
  onCsvPreview: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmCsvImport: (confirmSuspiciousDiff: boolean) => void;
  onClearCsvPreview: () => void;
  untappedCaptureSnippet: string;
  untappedHelperStatus: UntappedCaptureStatus | null;
  untappedGuideActive: boolean;
  untappedHelperLoading: boolean;
  untappedPreviewLoading: boolean;
  untappedPreview: UntappedImportSummary | UntappedCaptureImportSummary | null;
  untappedPreviewSource: "manual-file" | "latest-capture" | null;
  untappedImporting: boolean;
  untappedFile: File | null;
  onStartUntappedGuide: () => void;
  onCaptureUntappedCollection: () => void;
  onRestartUntappedCompanion: () => void;
  onCopyUntappedSnippet: () => void;
  onPreviewLatestUntappedCapture: () => void;
  onStopUntappedGuide: () => void;
  onUntappedPreview: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmUntappedImport: (confirmSuspiciousDiff: boolean) => void;
  onClearUntappedPreview: () => void;
  collectorHelperStatus: CollectorCaptureStatus | null;
  collectorHelperLoading: boolean;
  collectorStatusRefreshing: boolean;
  collectorSnapshotPreviewLoading: boolean;
  collectorSnapshotImporting: boolean;
  collectorSnapshotPreview: CollectionImportSummary | CollectorCaptureImportSummary | null;
  collectorSnapshotError: string;
  collectorPreviewSource: "manual-file" | "latest-capture" | null;
  collectorSnapshotFile: File | null;
  onRefreshCollectorStatus: () => void;
  onCaptureLatestCollectorSnapshot: () => void;
  onPreviewLatestCollectorSnapshot: () => void;
  onCollectorSnapshotPreview: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmCollectorSnapshotImport: (confirmSuspiciousDiff: boolean) => void;
  onClearCollectorPreview: () => void;
  importHistory: CollectionImportHistoryItem[];
  importHistoryLoading: boolean;
  restoringImportId: string | null;
  onRestoreImport: (importId: string) => void;
};

const getHistorySourceLabel = (source: string) => {
  if (source === "collection-csv") {
    return "Arena CSV";
  }
  if (source === "untapped-json") {
    return "Arena via Companion";
  }
  if (source === "collector-snapshot") {
    return "MTGA collector";
  }
  if (source === "history-restore") {
    return "Restored version";
  }
  return source;
};

const getCollectorAttentionMessage = (status: CollectorCaptureStatus) => {
  if (!status.enabled) {
    return (
      status.disabledReason ??
      "Direct Arena import is disabled for this server."
    );
  }
  if (!status.scriptAvailable) {
    return "The local Arena reader is not built. Rebuild the app, then check again.";
  }
  if (!status.addonAvailable) {
    return "The local Arena reader is missing. Install or update Untapped Companion, then check again.";
  }
  if (!status.codesignAvailable) {
    return "Install Xcode Command Line Tools so the local Arena reader can be prepared.";
  }
  if (!status.mtgaRunning) {
    return "Launch MTG Arena and leave it open. This page checks again automatically.";
  }
  return "Arena is running and ready to read.";
};

const getUntappedStatusLabel = (
  status: UntappedCaptureStatus | null,
  working: boolean
) => {
  if (!status || working) {
    return working ? "Syncing…" : "Checking…";
  }
  switch (status.automationState) {
    case "ready":
      return "Ready";
    case "not-running":
      return "Open Companion";
    case "restart-required":
      return "Restart needed";
    case "connecting":
      return "Connecting…";
    case "not-installed":
      return "Setup needed";
    default:
      return "Needs attention";
  }
};

export function ImportScreen({
  status,
  importMessage,
  errorMessage,
  formatDateTime,
  formatFileSize,
  csvFile,
  csvPreview,
  csvPreviewLoading,
  csvImporting,
  onCsvPreview,
  onConfirmCsvImport,
  onClearCsvPreview,
  untappedCaptureSnippet,
  untappedHelperStatus,
  untappedGuideActive,
  untappedHelperLoading,
  untappedPreviewLoading,
  untappedPreview,
  untappedPreviewSource,
  untappedImporting,
  untappedFile,
  onStartUntappedGuide,
  onCaptureUntappedCollection,
  onRestartUntappedCompanion,
  onCopyUntappedSnippet,
  onPreviewLatestUntappedCapture,
  onStopUntappedGuide,
  onUntappedPreview,
  onConfirmUntappedImport,
  onClearUntappedPreview,
  collectorHelperStatus,
  collectorHelperLoading,
  collectorStatusRefreshing,
  collectorSnapshotPreviewLoading,
  collectorSnapshotImporting,
  collectorSnapshotPreview,
  collectorSnapshotError,
  collectorPreviewSource,
  collectorSnapshotFile,
  onRefreshCollectorStatus,
  onCaptureLatestCollectorSnapshot,
  onPreviewLatestCollectorSnapshot,
  onCollectorSnapshotPreview,
  onConfirmCollectorSnapshotImport,
  onClearCollectorPreview,
  importHistory,
  importHistoryLoading,
  restoringImportId,
  onRestoreImport
}: ImportScreenProps) {
  const [selectedMethod, setSelectedMethod] = useState<ImportMethod>("untapped");
  const [alternateMethodsOpen, setAlternateMethodsOpen] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<CollectionImportHistoryItem | null>(null);
  const previousUpdate = importHistory[1] ?? null;
  const currentOwnedCopies = status?.collection.ownedCopies ?? null;
  const untappedReady = Boolean(
    untappedHelperStatus?.enabled && untappedHelperStatus.readyToCapture
  );
  const untappedNeedsRestart = Boolean(
    untappedHelperStatus?.restartRequired ||
      untappedHelperStatus?.automationState === "unavailable"
  );
  const untappedWorking =
    untappedHelperLoading || untappedPreviewLoading || untappedImporting;
  const untappedStatusLabel = getUntappedStatusLabel(
    untappedHelperStatus,
    untappedWorking
  );
  const collectorReady = Boolean(collectorHelperStatus?.readyToCapture);
  const collectorConfigured = Boolean(
    collectorHelperStatus?.enabled && collectorHelperStatus.available
  );
  const collectorFailureMessage =
    collectorSnapshotError || collectorHelperStatus?.lastFailure?.message || "";
  const selectedPreview =
    selectedMethod === "collector"
      ? collectorSnapshotPreview
      : selectedMethod === "csv"
        ? csvPreview
        : untappedPreview;
  const selectedWorking =
    selectedMethod === "collector"
      ? collectorHelperLoading || collectorSnapshotPreviewLoading
      : selectedMethod === "csv"
        ? csvPreviewLoading
        : untappedHelperLoading || untappedPreviewLoading;
  const activeStep = selectedPreview ? 3 : selectedWorking ? 2 : 1;

  const chooseMethod = (method: ImportMethod) => {
    setSelectedMethod(method);
    if (method !== "untapped") {
      setAlternateMethodsOpen(true);
    }
  };

  const confirmRestore = () => {
    if (!pendingRestore) {
      return;
    }
    onRestoreImport(pendingRestore.id);
    setPendingRestore(null);
  };

  return (
    <div className="import-flow">
      <section className="panel collection-summary-panel">
        <div className="panel-header">
          <div>
            <h2>Collection</h2>
            <span>
              {status?.collection.importedAt
                ? `Updated ${formatDateTime(status.collection.importedAt)}`
                : "No collection update yet"}
            </span>
          </div>
          <a className="button-link subtle-button" href="#collection-history">
            View history
          </a>
        </div>

        <div className="collection-summary-row">
          <div>
            <span>Cards</span>
            <strong>{(status?.collection.uniqueNames ?? 0).toLocaleString()}</strong>
          </div>
          <div>
            <span>Copies</span>
            <strong>{(status?.collection.ownedCopies ?? 0).toLocaleString()}</strong>
          </div>
          <div className={(status?.collection.unresolvedEntries ?? 0) > 0 ? "needs-attention" : ""}>
            <span>Need review</span>
            <strong>{(status?.collection.unresolvedEntries ?? 0).toLocaleString()}</strong>
          </div>
        </div>

        {previousUpdate ? (
          <button
            className="ghost-button subtle-button"
            disabled={Boolean(restoringImportId)}
            onClick={() => setPendingRestore(previousUpdate)}
            type="button"
          >
            Undo last update
          </button>
        ) : null}
      </section>

      <section className="panel import-panel update-collection-panel">
        <div className="panel-header">
          <div>
            <h2>Update collection</h2>
            <span>Your current collection changes only after you review and confirm.</span>
          </div>
        </div>

        <ol aria-label="Collection update steps" className="import-stepper">
          <li
            aria-current={activeStep === 1 ? "step" : undefined}
            className={activeStep === 1 ? "active" : activeStep > 1 ? "complete" : ""}
          >
            <span>1</span> Connect
          </li>
          <li
            aria-current={activeStep === 2 ? "step" : undefined}
            className={activeStep === 2 ? "active" : activeStep > 2 ? "complete" : ""}
          >
            <span>2</span> Read collection
          </li>
          <li aria-current={activeStep === 3 ? "step" : undefined} className={activeStep === 3 ? "active" : ""}>
            <span>3</span> Review & update
          </li>
        </ol>

        <div aria-label="Collection source" className="import-source-options">
          <div
            aria-label="Recommended collection method"
            className={
              selectedMethod === "untapped"
                ? "source-option primary-source active"
                : "source-option primary-source"
            }
            role="group"
          >
            <span className="source-option-badges">
              <span className="status-badge success">Recommended · Free</span>
              <span
                className={`status-badge ${untappedReady ? "success" : ""}`}
              >
                {untappedStatusLabel}
              </span>
            </span>
            <strong>Sync from Arena</strong>
            <small>
              Uses the free Untapped Companion desktop app locally. No paid export or
              Arena credentials required.
            </small>
            <div className="primary-source-actions">
              {selectedMethod !== "untapped" ? (
                <button
                  className="ghost-button"
                  onClick={() => chooseMethod("untapped")}
                  type="button"
                >
                  Use free Arena sync
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={
                    !untappedHelperStatus?.enabled ||
                    untappedHelperStatus.automationState === "not-installed" ||
                    untappedWorking
                  }
                  onClick={
                    untappedNeedsRestart
                      ? onRestartUntappedCompanion
                      : onCaptureUntappedCollection
                  }
                  type="button"
                >
                  {untappedWorking
                    ? "Updating cards & collection…"
                    : untappedNeedsRestart
                      ? "Restart Companion & sync"
                      : untappedPreview
                        ? "Sync again from Arena"
                        : "Sync collection"}
                </button>
              )}
            </div>
          </div>
          <details
            className="alternate-import-methods"
            onToggle={(event) =>
              setAlternateMethodsOpen(event.currentTarget.open)
            }
            open={alternateMethodsOpen}
          >
            <summary>Other import methods</summary>
            <div className="alternate-source-options">
              <button
                aria-pressed={selectedMethod === "csv"}
                className={selectedMethod === "csv" ? "source-option active" : "source-option"}
                onClick={() => chooseMethod("csv")}
                type="button"
              >
                <span className="status-badge">File upload</span>
                <strong>Arena CSV</strong>
                <small>Upload an existing Arena collection export.</small>
              </button>
              <button
                aria-pressed={selectedMethod === "collector"}
                className={selectedMethod === "collector" ? "source-option active" : "source-option"}
                onClick={() => chooseMethod("collector")}
                type="button"
              >
                <span className="status-badge">Experimental</span>
                <strong>Native Arena reader</strong>
                <small>Research-only direct process reader.</small>
              </button>
            </div>
          </details>
        </div>

        {errorMessage && !(selectedMethod === "collector" && collectorSnapshotError) ? (
          <div className="banner error import-context-message" role="alert">
            {errorMessage}
          </div>
        ) : null}
        {importMessage ? (
          <div
            aria-live="polite"
            className="banner success import-context-message"
            role="status"
          >
            {importMessage}
          </div>
        ) : null}

        {selectedMethod === "csv" ? (
          <div aria-busy={csvPreviewLoading || csvImporting} className="import-method-panel">
            <div className="method-heading">
              <div>
                <h3>Upload an Arena CSV</h3>
                <p>
                  Choose the export file, review the proposed totals, then replace the current
                  collection.
                </p>
              </div>
            </div>

            <label className="upload-drop">
              <input
                accept=".csv,text/csv"
                aria-label="Choose an Arena collection CSV"
                onChange={onCsvPreview}
                type="file"
              />
              <span>{csvFile ? csvFile.name : "Choose Arena collection CSV"}</span>
              <small>Nothing is imported when you choose the file.</small>
            </label>

            {csvPreviewLoading ? (
              <p aria-live="polite" className="empty-state" role="status">
                Checking the CSV and calculating changes…
              </p>
            ) : null}

            {csvPreview ? (
              <CollectionImportPreview
                currentOwnedCopies={currentOwnedCopies}
                importing={csvImporting}
                onCancel={onClearCsvPreview}
                onConfirm={onConfirmCsvImport}
                preview={csvPreview}
                formatDateTime={formatDateTime}
                contextSuffix={csvFile?.name}
              />
            ) : null}
          </div>
        ) : null}

        {selectedMethod === "untapped" ? (
          <div
            aria-busy={untappedWorking}
            className="import-method-panel"
          >
            <div className="method-heading">
              <div>
                <h3>Sync from running MTG Arena</h3>
                <p>
                  Refreshes Scryfall card data, then Companion reads your live Arena collection
                  locally. You review every change before this app updates.
                </p>
              </div>
            </div>

            {!untappedHelperStatus?.enabled ? (
              <div className="availability-callout">
                <strong>Local Companion sync is not enabled in this build.</strong>
                <span>You can still use the manual JSON fallback below.</span>
              </div>
            ) : (
              <>
                <div
                  className={`availability-callout ${
                    untappedHelperStatus.automationState === "ready" ? "success" : ""
                  }`}
                  role={
                    untappedHelperStatus.automationState === "unavailable"
                      ? "alert"
                      : "status"
                  }
                >
                  <strong>
                    {untappedHelperStatus.automationState === "ready"
                      ? "Arena sync is ready"
                      : untappedHelperStatus.automationState === "restart-required"
                        ? "One-time restart needed"
                        : untappedHelperStatus.automationState === "not-running"
                          ? "Companion will open automatically"
                          : untappedHelperStatus.automationState === "not-installed"
                            ? "Free Companion app required"
                            : "Arena sync needs attention"}
                  </strong>
                  <span>{untappedHelperStatus.message}</span>
                </div>
                {untappedHelperStatus.latestCapture ? (
                  <div className="helper-toolbar">
                    <button
                      className="ghost-button"
                      disabled={untappedPreviewLoading || untappedImporting}
                      onClick={onPreviewLatestUntappedCapture}
                      type="button"
                    >
                      Review previous sync
                    </button>
                    <span>
                      {formatDateTime(untappedHelperStatus.latestCapture.modifiedAt)}
                    </span>
                  </div>
                ) : null}
              </>
            )}

            {untappedWorking ? (
              <div className="availability-callout success" role="status">
                <strong>Updating card data and reading your Arena collection…</strong>
                <span>This may take a moment. Keep MTG Arena and Untapped Companion open.</span>
              </div>
            ) : null}

            {untappedGuideActive ? (
              <div className="availability-callout" role="status">
                <strong>Manual capture is watching Downloads</strong>
                <span>Finish the DevTools fallback; the review will appear automatically.</span>
              </div>
            ) : null}

            {untappedPreviewLoading ? (
              <p aria-live="polite" className="empty-state" role="status">
                Checking the Untapped collection and calculating changes…
              </p>
            ) : null}

            {untappedPreview ? (
              <CollectionImportPreview
                currentOwnedCopies={currentOwnedCopies}
                importing={untappedImporting}
                onCancel={onClearUntappedPreview}
                onConfirm={onConfirmUntappedImport}
                preview={untappedPreview}
                formatDateTime={formatDateTime}
                contextSuffix={
                  untappedPreviewSource === "latest-capture" &&
                  "capture" in untappedPreview
                    ? untappedPreview.capture.filename
                    : untappedFile?.name
                }
              />
            ) : null}

            <details className="technical-details capture-details">
              <summary>Manual fallback and diagnostics</summary>
              <p>
                If automatic sync is unavailable, capture through Companion DevTools or upload
                an existing raw collection JSON.
              </p>
              <div className="helper-toolbar">
                <button
                  className="ghost-button subtle-button"
                  disabled={!untappedHelperStatus?.available || untappedHelperLoading}
                  onClick={onStartUntappedGuide}
                  type="button"
                >
                  {untappedGuideActive ? "Manual capture is watching" : "Start manual capture"}
                </button>
                {untappedGuideActive ? (
                  <button
                    className="ghost-button subtle-button"
                    disabled={untappedHelperLoading}
                    onClick={onStopUntappedGuide}
                    type="button"
                  >
                    Stop watching
                  </button>
                ) : null}
                <button
                  className="ghost-button subtle-button"
                  onClick={onCopyUntappedSnippet}
                  type="button"
                >
                  Copy capture snippet
                </button>
              </div>
              <label className="upload-drop compact">
                <input
                  accept=".json,application/json"
                  aria-label="Choose an Untapped collection JSON file"
                  onChange={onUntappedPreview}
                  type="file"
                />
                <span>
                  {untappedFile ? untappedFile.name : "Choose Untapped collection JSON"}
                </span>
                <small>Choosing a file only creates a preview.</small>
              </label>
              <ol className="import-steps">
                <li>Open Untapped Companion and navigate to its MTGA view.</li>
                <li>Run the snippet below in Companion DevTools.</li>
                <li>Save the JSON in Downloads; this page will detect it.</li>
              </ol>
              <pre className="capture-snippet">
                <code>{untappedCaptureSnippet}</code>
              </pre>
              {untappedHelperStatus ? (
                <dl className="technical-details-grid">
                  <div>
                    <dt>Helper</dt>
                    <dd>{untappedHelperStatus.available ? "Ready" : "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>DevTools</dt>
                    <dd>{untappedHelperStatus.showDevTools ? "Enabled" : "Disabled"}</dd>
                  </div>
                  {untappedHelperStatus.downloadsPath ? (
                    <div>
                      <dt>Downloads</dt>
                      <dd>{untappedHelperStatus.downloadsPath}</dd>
                    </div>
                  ) : null}
                  {untappedHelperStatus.latestCapture ? (
                    <div>
                      <dt>Latest file</dt>
                      <dd>
                        {untappedHelperStatus.latestCapture.filename} ·{" "}
                        {formatFileSize(untappedHelperStatus.latestCapture.size)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
            </details>
          </div>
        ) : null}

        {selectedMethod === "collector" ? (
          <div
            aria-busy={collectorSnapshotPreviewLoading || collectorSnapshotImporting}
            className="import-method-panel"
          >
            <div className="method-heading">
              <div>
                <h3>Refresh from running MTG Arena</h3>
                <p>
                  Read the collection from the running Arena client, review the changes, then
                  update this app.
                </p>
              </div>
            </div>

            {!collectorHelperStatus ? (
              <div className="availability-callout" role="status">
                <strong>Checking for MTG Arena…</strong>
                <span>Looking for the local reader and a running Arena client.</span>
              </div>
            ) : (
              <>
                <div
                  className={`availability-callout ${collectorReady ? "success" : ""}`}
                  role={collectorFailureMessage ? "alert" : "status"}
                >
                  <strong>
                    {collectorFailureMessage
                      ? "Arena import needs attention"
                      : collectorReady
                        ? "Arena is ready"
                        : collectorConfigured
                          ? "Open MTG Arena to continue"
                          : "Direct import needs setup"}
                  </strong>
                  <span>
                    {collectorFailureMessage ||
                      getCollectorAttentionMessage(collectorHelperStatus)}
                  </span>
                </div>
                <div className="helper-toolbar live-capture-toolbar">
                  {!collectorReady ? (
                    <button
                      className="ghost-button"
                      disabled={collectorStatusRefreshing || collectorHelperLoading}
                      onClick={onRefreshCollectorStatus}
                      type="button"
                    >
                      {collectorStatusRefreshing ? "Checking…" : "Check again"}
                    </button>
                  ) : null}
                  <button
                    className="ghost-button"
                    disabled={
                      !collectorHelperStatus.latestCapture ||
                      collectorHelperLoading ||
                      collectorStatusRefreshing ||
                      collectorSnapshotImporting
                    }
                    onClick={onPreviewLatestCollectorSnapshot}
                    type="button"
                  >
                    Review latest capture
                  </button>
                </div>
              </>
            )}

            {collectorSnapshotPreviewLoading ? (
              <p aria-live="polite" className="empty-state" role="status">
                Checking the collector snapshot and calculating changes…
              </p>
            ) : null}

            {collectorSnapshotPreview ? (
              <CollectionImportPreview
                currentOwnedCopies={currentOwnedCopies}
                importing={collectorSnapshotImporting}
                onCancel={onClearCollectorPreview}
                onConfirm={onConfirmCollectorSnapshotImport}
                preview={collectorSnapshotPreview}
                formatDateTime={formatDateTime}
                contextSuffix={
                  collectorPreviewSource === "latest-capture" &&
                  "capture" in collectorSnapshotPreview
                    ? collectorSnapshotPreview.capture.filename
                    : collectorSnapshotFile?.name
                }
              />
            ) : null}

            <details className="technical-details capture-details">
              <summary>Troubleshooting and manual fallback</summary>
              <label className="upload-drop compact">
                <input
                  accept=".json,application/json"
                  aria-label="Choose a collector snapshot JSON file"
                  onChange={onCollectorSnapshotPreview}
                  type="file"
                />
                <span>
                  {collectorSnapshotFile
                    ? collectorSnapshotFile.name
                    : "Choose collector snapshot JSON"}
                </span>
                <small>Use only if live reading is unavailable.</small>
              </label>
              {collectorHelperStatus ? (
                <dl className="technical-details-grid">
                  <div>
                    <dt>Local reader</dt>
                    <dd>{collectorHelperStatus.available ? "Configured" : "Needs setup"}</dd>
                  </div>
                  <div>
                    <dt>MTGA</dt>
                    <dd>{collectorHelperStatus.mtgaRunning ? "Running" : "Not detected"}</dd>
                  </div>
                  <div>
                    <dt>Reader dependency</dt>
                    <dd>{collectorHelperStatus.addonAvailable ? "Found" : "Missing"}</dd>
                  </div>
                  <div>
                    <dt>Codesign</dt>
                    <dd>{collectorHelperStatus.codesignAvailable ? "Ready" : "Missing"}</dd>
                  </div>
                </dl>
              ) : null}
            </details>
          </div>
        ) : null}
      </section>

      <section className="panel import-history-panel" id="collection-history">
        <div className="panel-header">
          <div>
            <h2>Update history</h2>
            <span>Restore an earlier collection if an update was incorrect.</span>
          </div>
          <span>{importHistory.length.toLocaleString()} saved</span>
        </div>

        {importHistoryLoading ? (
          <p aria-live="polite" className="empty-state" role="status">
            Loading update history…
          </p>
        ) : importHistory.length ? (
          <div className="import-history-list">
            {importHistory.slice(0, 6).map((entry, index) => (
              <article className="import-history-row" key={entry.id}>
                <div>
                  <strong>{index === 0 ? "Current collection" : getHistorySourceLabel(entry.source)}</strong>
                  <span>
                    {formatDateTime(entry.importedAt)} · {entry.cardEntries.toLocaleString()} cards ·{" "}
                    {entry.ownedCopies.toLocaleString()} copies
                  </span>
                </div>
                {index > 0 ? (
                  <button
                    className="ghost-button subtle-button"
                    disabled={Boolean(restoringImportId)}
                    onClick={() => setPendingRestore(entry)}
                    type="button"
                  >
                    {restoringImportId === entry.id ? "Restoring…" : "Restore"}
                  </button>
                ) : (
                  <span className="status-badge success">Current</span>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No saved updates yet.</p>
        )}
      </section>

      {pendingRestore ? (
        <div className="restore-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="restore-heading">
          <div className="restore-confirmation-card">
            <h2 id="restore-heading">Restore this collection?</h2>
            <p>
              Restore the {pendingRestore.cardEntries.toLocaleString()}-card collection saved{" "}
              {formatDateTime(pendingRestore.importedAt)}. The current version will remain in
              history.
            </p>
            <div className="review-actions">
              <button
                className="ghost-button"
                onClick={() => setPendingRestore(null)}
                type="button"
              >
                Cancel
              </button>
              <button className="primary-button" onClick={confirmRestore} type="button">
                Restore collection
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
