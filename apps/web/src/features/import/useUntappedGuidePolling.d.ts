import { type Dispatch, type SetStateAction } from "react";
import type { UntappedCaptureStatus, UntappedImportSummary } from "../../types";
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
export declare const useUntappedGuidePolling: ({ activeTab, untappedGuideActive, lastAutoPreviewedCaptureId, setUntappedHelperStatus, setUntappedGuideActive, setLastAutoPreviewedCaptureId, setUntappedPreviewLoading, setUntappedFile, setUntappedPreview, setUntappedPreviewSource, setImportMessage, onError }: UseUntappedGuidePollingArgs) => void;
export {};
