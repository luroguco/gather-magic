import { useEffect } from "react";
import { getUntappedHelperStatus, previewLatestUntappedCapture } from "../../api";
const getUntappedCaptureIdentity = (capture) => capture ? `${capture.path}::${capture.modifiedAt}` : null;
export const useUntappedGuidePolling = ({ activeTab, untappedGuideActive, lastAutoPreviewedCaptureId, setUntappedHelperStatus, setUntappedGuideActive, setLastAutoPreviewedCaptureId, setUntappedPreviewLoading, setUntappedFile, setUntappedPreview, setUntappedPreviewSource, setImportMessage, onError }) => {
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
                }
                catch (error) {
                    if (!cancelled) {
                        onError(error instanceof Error ? error.message : "Failed to preview the latest Untapped capture.");
                    }
                }
                finally {
                    if (!cancelled) {
                        setUntappedPreviewLoading(false);
                    }
                }
            }
            catch (error) {
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
