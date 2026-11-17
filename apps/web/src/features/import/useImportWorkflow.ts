import { useState } from "react";

import type {
  CollectionCsvPreview,
  CollectionImportSummary,
  CollectorCaptureImportSummary,
  CollectorCaptureStatus,
  UntappedCaptureImportSummary,
  UntappedCaptureStatus,
  UntappedImportSummary
} from "../../types";

export type CollectorPreviewSource = "manual-file" | "latest-capture";
export type UntappedPreviewSource = "manual-file" | "latest-capture";

export const useImportWorkflow = () => {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<CollectionCsvPreview | null>(null);
  const [csvPreviewLoading, setCsvPreviewLoading] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);

  const [collectorSnapshotFile, setCollectorSnapshotFile] = useState<File | null>(null);
  const [collectorSnapshotPreview, setCollectorSnapshotPreview] = useState<
    CollectionImportSummary | CollectorCaptureImportSummary | null
  >(null);
  const [collectorSnapshotPreviewLoading, setCollectorSnapshotPreviewLoading] =
    useState(false);
  const [collectorSnapshotImporting, setCollectorSnapshotImporting] = useState(false);
  const [collectorHelperStatus, setCollectorHelperStatus] =
    useState<CollectorCaptureStatus | null>(null);
  const [collectorHelperLoading, setCollectorHelperLoading] = useState(false);
  const [collectorStatusRefreshing, setCollectorStatusRefreshing] = useState(false);
  const [collectorPreviewSource, setCollectorPreviewSource] =
    useState<CollectorPreviewSource | null>(null);
  const [collectorSnapshotError, setCollectorSnapshotError] = useState("");

  const [untappedFile, setUntappedFile] = useState<File | null>(null);
  const [untappedPreview, setUntappedPreview] = useState<
    UntappedImportSummary | UntappedCaptureImportSummary | null
  >(null);
  const [untappedPreviewLoading, setUntappedPreviewLoading] = useState(false);
  const [untappedImporting, setUntappedImporting] = useState(false);
  const [untappedHelperStatus, setUntappedHelperStatus] =
    useState<UntappedCaptureStatus | null>(null);
  const [untappedHelperLoading, setUntappedHelperLoading] = useState(false);
  const [untappedGuideActive, setUntappedGuideActive] = useState(false);
  const [untappedPreviewSource, setUntappedPreviewSource] =
    useState<UntappedPreviewSource | null>(null);
  const [lastAutoPreviewedCaptureId, setLastAutoPreviewedCaptureId] =
    useState<string | null>(null);

  return {
    csvFile,
    setCsvFile,
    csvPreview,
    setCsvPreview,
    csvPreviewLoading,
    setCsvPreviewLoading,
    csvImporting,
    setCsvImporting,
    collectorSnapshotFile,
    setCollectorSnapshotFile,
    collectorSnapshotPreview,
    setCollectorSnapshotPreview,
    collectorSnapshotPreviewLoading,
    setCollectorSnapshotPreviewLoading,
    collectorSnapshotImporting,
    setCollectorSnapshotImporting,
    collectorHelperStatus,
    setCollectorHelperStatus,
    collectorHelperLoading,
    setCollectorHelperLoading,
    collectorStatusRefreshing,
    setCollectorStatusRefreshing,
    collectorPreviewSource,
    setCollectorPreviewSource,
    collectorSnapshotError,
    setCollectorSnapshotError,
    untappedFile,
    setUntappedFile,
    untappedPreview,
    setUntappedPreview,
    untappedPreviewLoading,
    setUntappedPreviewLoading,
    untappedImporting,
    setUntappedImporting,
    untappedHelperStatus,
    setUntappedHelperStatus,
    untappedHelperLoading,
    setUntappedHelperLoading,
    untappedGuideActive,
    setUntappedGuideActive,
    untappedPreviewSource,
    setUntappedPreviewSource,
    lastAutoPreviewedCaptureId,
    setLastAutoPreviewedCaptureId
  };
};
