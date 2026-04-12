import { useEffect, type Dispatch, type SetStateAction } from "react";

import { getUntappedHelperStatus, previewLatestUntappedCapture } from "../../api";
import type { UntappedCaptureFile, UntappedCaptureStatus, UntappedImportSummary } from "../../types";

const getUntappedCaptureIdentity = (capture: UntappedCaptureFile | null) =>
  capture ? `${capture.path}::${capture.modifiedAt}` : null;

type UseUntappedGuidePollingArgs = {
  activeTab: "search" | "stats" | "decks" | "import";
  untappedGuideActive: boolean;
  lastAutoPreviewedCaptureId: string | null;
  setUntappedHelperStatus: Dispatch<SetStateAction<UntappedCaptureStatus | null>>;
  setUntappedGuideActive: Dispatch<SetStateAction<boolean>>;
  setLastAutoPreviewedCaptureId: Dispatch<SetStateAction<string | null>>;
  setUntappedPreviewLoading: Dispatch<SetStateAction<boolean>>;
  setUntappedFile: Dispatch<SetStateAction<File | null>>;
  setUntappedPreview: Dispatch<SetStateAction<UntappedImportSummary | null>>;
  setUntappedPreviewSource: Dispatch<SetStateAction<"manual-file" | "latest-capture" | null>>;
  setImportMessage: Dispatch<SetStateAction<string>>;
  onError: (message: string) => void;
};

export const useUntappedGuidePolling = ({
  activeTab,
  untappedGuideActive,
  lastAutoPreviewedCaptureId,
  setUntappedHelperStatus,
  setUntappedGuideActive,
  setLastAutoPreviewedCaptureId,
  setUntappedPreviewLoading,
  setUntappedFile,
  setUntappedPreview,
  setUntappedPreviewSource,
  setImportMessage,
  onError
}: UseUntappedGuidePollingArgs) => {
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
            onError(error instanceof Error ? error.message : "Failed to preview the latest Untapped capture.");
          }
        } finally {
          if (!cancelled) {
            setUntappedPreviewLoading(false);
          }
        }
      } catch (error) {
        if (!cancelled) {
          onError(error instanceof Error ? error.message : "Failed to poll Untapped capture status.");
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
  }, [
    activeTab,
    lastAutoPreviewedCaptureId,
    onError,
    setImportMessage,
    setLastAutoPreviewedCaptureId,
    setUntappedFile,
    setUntappedGuideActive,
    setUntappedHelperStatus,
    setUntappedPreview,
    setUntappedPreviewLoading,
    setUntappedPreviewSource,
    untappedGuideActive
  ]);
};
