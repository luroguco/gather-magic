import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  UntappedCaptureStatus
} from "../../types";
import { ImportScreen } from "./ImportScreen";

type Props = ComponentProps<typeof ImportScreen>;

const untappedStatus = (
  overrides: Partial<UntappedCaptureStatus> = {}
): UntappedCaptureStatus => ({
  enabled: true,
  available: true,
  configPath: "/tmp/untapped/config.json",
  downloadsPath: "/tmp/Downloads",
  showDevTools: true,
  latestCapture: null,
  companionInstalled: true,
  companionRunning: true,
  companionPid: 4567,
  automationState: "ready",
  readyToCapture: true,
  restartRequired: false,
  message: "Arena is ready to sync through Companion.",
  snippet: "",
  ...overrides
});

const buildProps = (overrides: Partial<Props> = {}): Props => ({
  status: null,
  importMessage: "",
  errorMessage: "",
  formatDateTime: (value) => value ?? "Never",
  formatFileSize: (size) => `${size} B`,
  csvFile: null,
  csvPreview: null,
  csvPreviewLoading: false,
  csvImporting: false,
  onCsvPreview: vi.fn(),
  onConfirmCsvImport: vi.fn(),
  onClearCsvPreview: vi.fn(),
  untappedCaptureSnippet: "",
  untappedHelperStatus: null,
  untappedGuideActive: false,
  untappedHelperLoading: false,
  untappedPreviewLoading: false,
  untappedPreview: null,
  untappedPreviewSource: null,
  untappedImporting: false,
  untappedFile: null,
  onStartUntappedGuide: vi.fn(),
  onCaptureUntappedCollection: vi.fn(),
  onRestartUntappedCompanion: vi.fn(),
  onCopyUntappedSnippet: vi.fn(),
  onPreviewLatestUntappedCapture: vi.fn(),
  onStopUntappedGuide: vi.fn(),
  onUntappedPreview: vi.fn(),
  onConfirmUntappedImport: vi.fn(),
  onClearUntappedPreview: vi.fn(),
  collectorHelperStatus: null,
  collectorHelperLoading: false,
  collectorStatusRefreshing: false,
  collectorSnapshotPreviewLoading: false,
  collectorSnapshotImporting: false,
  collectorSnapshotPreview: null,
  collectorSnapshotError: "",
  collectorPreviewSource: null,
  collectorSnapshotFile: null,
  onRefreshCollectorStatus: vi.fn(),
  onCaptureLatestCollectorSnapshot: vi.fn(),
  onPreviewLatestCollectorSnapshot: vi.fn(),
  onCollectorSnapshotPreview: vi.fn(),
  onConfirmCollectorSnapshotImport: vi.fn(),
  onClearCollectorPreview: vi.fn(),
  importHistory: [],
  importHistoryLoading: false,
  restoringImportId: null,
  onRestoreImport: vi.fn(),
  ...overrides
});

describe("ImportScreen free Arena sync workflow", () => {
  it("selects free Companion sync by default while status is loading", () => {
    render(<ImportScreen {...buildProps()} />);

    expect(
      screen.getByRole("group", { name: "Recommended collection method" })
    ).toHaveTextContent("Sync from Arena");
    expect(
      screen.getByRole("heading", { name: "Sync from running MTG Arena" })
    ).toBeInTheDocument();
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Upload an Arena CSV" })
    ).not.toBeInTheDocument();
  });

  it("offers the required one-time Companion restart", () => {
    const onRestartUntappedCompanion = vi.fn();
    render(
      <ImportScreen
        {...buildProps({
          untappedHelperStatus: untappedStatus({
            readyToCapture: false,
            restartRequired: true,
            automationState: "restart-required",
            message: "Restart Companion once to enable automatic local sync."
          }),
          onRestartUntappedCompanion
        })}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Restart Companion & sync" })
    );
    expect(onRestartUntappedCompanion).toHaveBeenCalledTimes(1);
  });

  it("enables free one-click sync and keeps CSV reachable", () => {
    const onCaptureUntappedCollection = vi.fn();
    render(
      <ImportScreen
        {...buildProps({
          untappedHelperStatus: untappedStatus(),
          onCaptureUntappedCollection
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sync collection" }));
    expect(onCaptureUntappedCollection).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("Other import methods"));
    fireEvent.click(screen.getByRole("button", { name: /Arena CSV/i }));
    expect(
      screen.getByRole("heading", { name: "Upload an Arena CSV" })
    ).toBeInTheDocument();
  });
});
