import type {
  AppStatus,
  CollectionImportSummary,
  CollectorCaptureImportSummary,
  CollectorCaptureStatus,
  UntappedImportSummary,
  UntappedCaptureStatus
} from "../../types";
import { CollectionImportPreview } from "./CollectionImportPreview";

type ImportScreenProps = {
  status: AppStatus | null;
  formatDateTime: (value: string | null) => string;
  formatFileSize: (size: number) => string;
  untappedCaptureSnippet: string;
  untappedHelperStatus: UntappedCaptureStatus | null;
  untappedGuideActive: boolean;
  untappedHelperLoading: boolean;
  untappedPreviewLoading: boolean;
  untappedPreview: UntappedImportSummary | null;
  untappedPreviewSource: "manual-file" | "latest-capture" | null;
  untappedImporting: boolean;
  untappedFile: File | null;
  onStartUntappedGuide: () => void;
  onCopyUntappedSnippet: () => void;
  onPreviewLatestUntappedCapture: () => void;
  onStopUntappedGuide: () => void;
  onUntappedPreview: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmUntappedImport: () => void;
  collectorHelperStatus: CollectorCaptureStatus | null;
  collectorHelperLoading: boolean;
  collectorSnapshotPreviewLoading: boolean;
  collectorSnapshotImporting: boolean;
  collectorSnapshotPreview: CollectionImportSummary | CollectorCaptureImportSummary | null;
  collectorPreviewSource: "manual-file" | "latest-capture" | null;
  collectorSnapshotFile: File | null;
  onCaptureLatestCollectorSnapshot: () => void;
  onPreviewLatestCollectorSnapshot: () => void;
  onCollectorSnapshotPreview: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onConfirmCollectorSnapshotImport: () => void;
  onImportCsv: (event: React.ChangeEvent<HTMLInputElement>) => void;
  formatImportPreviewContext: (preview: CollectionImportSummary) => string;
};

export function ImportScreen({
  status,
  formatDateTime,
  formatFileSize,
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
  onCopyUntappedSnippet,
  onPreviewLatestUntappedCapture,
  onStopUntappedGuide,
  onUntappedPreview,
  onConfirmUntappedImport,
  collectorHelperStatus,
  collectorHelperLoading,
  collectorSnapshotPreviewLoading,
  collectorSnapshotImporting,
  collectorSnapshotPreview,
  collectorPreviewSource,
  collectorSnapshotFile,
  onCaptureLatestCollectorSnapshot,
  onPreviewLatestCollectorSnapshot,
  onCollectorSnapshotPreview,
  onConfirmCollectorSnapshotImport,
  onImportCsv,
  formatImportPreviewContext
}: ImportScreenProps) {
  return (
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
            Capture a local <code>mtga.collection</code> JSON dump from Untapped Companion, preview it here, then replace your current collection snapshot.
          </p>

          <div className="helper-toolbar">
            <button className="primary-button" disabled={untappedHelperLoading} onClick={onStartUntappedGuide} type="button">
              {untappedHelperLoading ? "Starting..." : "Start guided capture"}
            </button>
            <button className="ghost-button" onClick={onCopyUntappedSnippet} type="button">
              Copy snippet
            </button>
            <button className="ghost-button" disabled={!untappedHelperStatus?.latestCapture || untappedPreviewLoading} onClick={onPreviewLatestUntappedCapture} type="button">
              Preview latest download
            </button>
            <button className="ghost-button" disabled={untappedHelperLoading || !untappedHelperStatus?.showDevTools} onClick={onStopUntappedGuide} type="button">
              Stop guided capture
            </button>
          </div>

          <p className="helper-note">
            Guided mode enables Untapped DevTools, watches your Downloads folder, and previews the next capture automatically after the JSON download finishes.
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
                    {untappedHelperStatus.latestCapture ? formatDateTime(untappedHelperStatus.latestCapture.modifiedAt) : "Waiting"}
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
                    <strong>Latest file:</strong> <code>{untappedHelperStatus.latestCapture.path}</code> ({formatFileSize(untappedHelperStatus.latestCapture.size)})
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
            <code>{untappedCaptureSnippet}</code>
          </pre>

          <label className="upload-drop">
            <input accept=".json,application/json" onChange={onUntappedPreview} type="file" />
            <span>{untappedFile ? untappedFile.name : "Choose your Untapped collection JSON"}</span>
            <small>
              Raw <code>grpId -&gt; quantity</code> map exported from the Untapped renderer.
            </small>
          </label>

          {untappedPreviewLoading ? <p className="empty-state">Previewing Untapped collection...</p> : null}

          {untappedPreview ? (
            <CollectionImportPreview
              preview={untappedPreview}
              importing={untappedImporting}
              onConfirm={onConfirmUntappedImport}
              formatImportPreviewContext={formatImportPreviewContext}
              formatDateTime={formatDateTime}
              contextSuffix={
                untappedPreviewSource === "latest-capture" && untappedHelperStatus?.latestCapture
                  ? untappedHelperStatus.latestCapture.filename
                  : undefined
              }
            />
          ) : null}
        </section>

        <section className="panel import-panel">
          <div className="panel-header">
            <h2>Collector Snapshot</h2>
            <span>One-click local capture</span>
          </div>

          <p className="hero-copy">
            Refresh directly from the running MTGA client, preview the captured snapshot here, then replace your current collection.
          </p>

          <div className="helper-toolbar">
            <button className="primary-button" disabled={collectorHelperLoading || collectorSnapshotImporting} onClick={onCaptureLatestCollectorSnapshot} type="button">
              {collectorHelperLoading ? "Refreshing..." : "Refresh From MTGA"}
            </button>
            <button className="ghost-button" disabled={!collectorHelperStatus?.latestCapture || collectorHelperLoading || collectorSnapshotImporting} onClick={onPreviewLatestCollectorSnapshot} type="button">
              Preview latest snapshot
            </button>
          </div>

          <p className="helper-note">
            This uses the local signed collector host, writes a snapshot to disk, and then previews the result before import.
          </p>

          <ol className="import-steps">
            <li>Open MTG Arena and leave it running.</li>
            <li>Click <strong>Refresh From MTGA</strong>.</li>
            <li>Wait for the preview to appear.</li>
            <li>Check the counts, then click <strong>Confirm import</strong>.</li>
          </ol>

          {collectorHelperStatus ? (
            <div className="subpanel helper-status-panel">
              <div className="panel-header">
                <h3>Local collector status</h3>
                <span>{collectorHelperStatus.available ? "Ready" : "Needs attention"}</span>
              </div>
              <div className="snapshot-grid helper-status-grid">
                <div className="stat-card dense">
                  <span>Collector</span>
                  <strong>{collectorHelperStatus.available ? "Ready" : "Unavailable"}</strong>
                </div>
                <div className="stat-card dense">
                  <span>MTGA</span>
                  <strong>
                    {collectorHelperStatus.mtgaRunning
                      ? `Running${collectorHelperStatus.mtgaPid ? ` · PID ${collectorHelperStatus.mtgaPid}` : ""}`
                      : "Not detected"}
                  </strong>
                </div>
                <div className="stat-card dense">
                  <span>Addon</span>
                  <strong>{collectorHelperStatus.addonAvailable ? "Found" : "Missing"}</strong>
                </div>
                <div className="stat-card dense">
                  <span>codesign</span>
                  <strong>{collectorHelperStatus.codesignAvailable ? "Ready" : "Missing"}</strong>
                </div>
                <div className="stat-card dense">
                  <span>Latest snapshot</span>
                  <strong>{collectorHelperStatus.latestCapture ? collectorHelperStatus.latestCapture.filename : "None yet"}</strong>
                </div>
                <div className="stat-card dense">
                  <span>Updated</span>
                  <strong>
                    {collectorHelperStatus.latestCapture ? formatDateTime(collectorHelperStatus.latestCapture.modifiedAt) : "Waiting"}
                  </strong>
                </div>
              </div>

              <div className="helper-path-list">
                <p>
                  <strong>Snapshot path:</strong> <code>{collectorHelperStatus.snapshotPath}</code>
                </p>
                <p>
                  <strong>Addon path:</strong> <code>{collectorHelperStatus.addonPath}</code>
                </p>
              </div>
            </div>
          ) : null}

          <label className="upload-drop">
            <input accept=".json,application/json" onChange={onCollectorSnapshotPreview} type="file" />
            <span>{collectorSnapshotFile ? collectorSnapshotFile.name : "Choose your collector snapshot JSON"}</span>
            <small>
              Supports <code>{`{ snapshotVersion, collection }`}</code> or a raw <code>grpId -&gt; quantity</code> map.
            </small>
          </label>

          {collectorSnapshotPreviewLoading ? <p className="empty-state">Previewing collector snapshot...</p> : null}

          {collectorSnapshotPreview ? (
            <CollectionImportPreview
              preview={collectorSnapshotPreview}
              importing={collectorSnapshotImporting}
              onConfirm={onConfirmCollectorSnapshotImport}
              formatImportPreviewContext={formatImportPreviewContext}
              formatDateTime={formatDateTime}
              contextSuffix={
                collectorPreviewSource === "latest-capture" && "capture" in collectorSnapshotPreview
                  ? collectorSnapshotPreview.capture.filename
                  : undefined
              }
            />
          ) : null}
        </section>

        <section className="panel import-panel">
          <div className="panel-header">
            <h2>Collection CSV</h2>
            <span>Fallback import</span>
          </div>

          <p className="hero-copy">
            Upload an MTG Arena collection export. The new file replaces the current ownership snapshot atomically.
          </p>

          <label className="upload-drop">
            <input accept=".csv,text/csv" onChange={onImportCsv} type="file" />
            <span>Choose your Arena collection CSV</span>
            <small>Required columns: Id, Name, Set, Color, Rarity, Count, PrintCount</small>
          </label>
        </section>
      </div>
    </div>
  );
}
