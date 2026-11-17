import type {
  AppStatus,
  ArenaDeckSyncSummary,
  CardStatsResponse,
  CardDetail,
  CollectionCsvPreview,
  CollectionImportHistoryItem,
  CollectionImportSummary,
  CollectionRestoreResult,
  CollectorCaptureImportSummary,
  CollectorCaptureStatus,
  Deck,
  DeckBulkExport,
  DeckCard,
  DeckListItem,
  Mechanic,
  UntappedCaptureImportSummary,
  UntappedCaptureStartResult,
  UntappedCaptureStatus,
  UntappedCaptureStopResult,
  SearchResponse,
  UntappedImportSummary,
  ValidationResult
} from "./types";
import type {
  CoachIdeasRequest,
  CoachIdeasResponse,
  CoachPrototypeRequest,
  CoachPrototypeResponse
} from "@mtga/contracts";

const jsonHeaders = {
  "Content-Type": "application/json"
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const text = await response.text();
    let parsedError: string | null = null;
    let parsedCode: string | null = null;

    if (text.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(text) as { error?: string; code?: string };
        if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
          parsedError = parsed.error;
        }
        if (typeof parsed.code === "string" && parsed.code.trim().length > 0) {
          parsedCode = parsed.code;
        }
      } catch {
        // Fall through to the raw text if the error payload is not valid JSON.
      }
    }

    throw new ApiError(
      parsedError ?? (text || `Request failed with ${response.status}`),
      response.status,
      parsedCode
    );
  }
  return (await response.json()) as T;
}

export const getStatus = () => request<AppStatus>("/api/status");

export const getMechanics = async (options?: { ownedOnly?: boolean }) => {
  const params = new URLSearchParams();
  if (options?.ownedOnly) {
    params.set("ownedOnly", "true");
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return (await request<{ items: Mechanic[] }>(`/api/mechanics${suffix}`)).items;
};

export const searchCards = (params: URLSearchParams) =>
  request<SearchResponse>(`/api/cards/search?${params.toString()}`);

export const getCardStats = (params: URLSearchParams) =>
  request<CardStatsResponse>(`/api/stats/cards?${params.toString()}`);

export const getCard = (id: string) => request<CardDetail>(`/api/cards/${id}`);

export const getCoachIdeas = (payload: CoachIdeasRequest) =>
  request<CoachIdeasResponse>("/api/coach/ideas", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });

export const getCoachPrototype = (payload: CoachPrototypeRequest) =>
  request<CoachPrototypeResponse>("/api/coach/prototype", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });

const confirmationSuffix = (confirmSuspiciousDiff: boolean) =>
  confirmSuspiciousDiff ? "?confirmSuspiciousDiff=true" : "";

export const previewCollectionCsv = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<CollectionCsvPreview>("/api/imports/collection-csv/preview", {
    method: "POST",
    body: formData
  });
};

export const uploadCollection = async (file: File, confirmSuspiciousDiff = false) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<CollectionCsvPreview & { importedAt: string }>(
    `/api/imports/collection-csv${confirmationSuffix(confirmSuspiciousDiff)}`,
    {
      method: "POST",
      body: formData
    }
  );
};

export const previewUntappedCollection = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<UntappedImportSummary>("/api/imports/untapped-json/preview", {
    method: "POST",
    body: formData
  });
};

export const importUntappedCollection = async (file: File, confirmSuspiciousDiff = false) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<UntappedImportSummary>(
    `/api/imports/untapped-json${confirmationSuffix(confirmSuspiciousDiff)}`,
    {
      method: "POST",
      body: formData
    }
  );
};

export const previewCollectorSnapshot = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<CollectionImportSummary>("/api/imports/collector-snapshot/preview", {
    method: "POST",
    body: formData
  });
};

export const importCollectorSnapshot = async (file: File, confirmSuspiciousDiff = false) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<CollectionImportSummary>(
    `/api/imports/collector-snapshot${confirmationSuffix(confirmSuspiciousDiff)}`,
    {
      method: "POST",
      body: formData
    }
  );
};

export const getCollectorHelperStatus = () =>
  request<CollectorCaptureStatus>("/api/imports/collector-helper/status");

export const capturePreviewCollectorSnapshot = () =>
  request<CollectorCaptureImportSummary>("/api/imports/collector-helper/capture-preview", {
    method: "POST"
  });

export const previewLatestCollectorSnapshot = () =>
  request<CollectorCaptureImportSummary>("/api/imports/collector-helper/preview-latest", {
    method: "POST"
  });

export const importLatestCollectorSnapshot = (
  captureId: string,
  confirmSuspiciousDiff = false
) => {
  const params = new URLSearchParams({ captureId });
  if (confirmSuspiciousDiff) {
    params.set("confirmSuspiciousDiff", "true");
  }
  return request<CollectorCaptureImportSummary>(
    `/api/imports/collector-helper/import-latest?${params.toString()}`,
    {
      method: "POST"
    }
  );
};

export const getUntappedHelperStatus = () =>
  request<UntappedCaptureStatus>("/api/imports/untapped-helper/status");

export const restartUntappedCompanion = () =>
  request<UntappedCaptureStatus>("/api/imports/untapped-helper/restart", {
    method: "POST"
  });

export const capturePreviewUntappedCollection = () =>
  request<UntappedCaptureImportSummary>(
    "/api/imports/untapped-helper/capture-preview",
    {
      method: "POST"
    }
  );

export const startUntappedHelper = () =>
  request<UntappedCaptureStartResult>("/api/imports/untapped-helper/start", {
    method: "POST"
  });

export const stopUntappedHelper = () =>
  request<UntappedCaptureStopResult>("/api/imports/untapped-helper/stop", {
    method: "POST"
  });

export const previewLatestUntappedCapture = () =>
  request<UntappedCaptureImportSummary>("/api/imports/untapped-helper/preview-latest", {
    method: "POST"
  });

export const importLatestUntappedCapture = (
  captureId: string,
  confirmSuspiciousDiff = false
) => {
  const params = new URLSearchParams({ captureId });
  if (confirmSuspiciousDiff) {
    params.set("confirmSuspiciousDiff", "true");
  }
  return request<UntappedCaptureImportSummary>(
    `/api/imports/untapped-helper/import-latest?${params.toString()}`,
    {
      method: "POST"
    }
  );
};

export const getCollectionImportHistory = async () =>
  (await request<{ items: CollectionImportHistoryItem[] }>("/api/collection/imports")).items;

export const restoreCollectionImport = (id: string) =>
  request<CollectionRestoreResult>(`/api/collection/imports/${id}/restore`, {
    method: "POST"
  });

export const listDecks = async () =>
  (await request<{ items: DeckListItem[] }>("/api/decks")).items;

export const previewArenaDeckSync = (includeStarterDecks = false) =>
  request<ArenaDeckSyncSummary>("/api/decks/imports/arena-log/preview", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ includeStarterDecks })
  });

export const syncArenaDecks = (includeStarterDecks = false) =>
  request<ArenaDeckSyncSummary>("/api/decks/imports/arena-log", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ includeStarterDecks })
  });

export const getDeck = (id: string) => request<Deck>(`/api/decks/${id}`);

export const createDeck = (payload: {
  name: string;
  format: Deck["format"];
  notes?: string;
  cards?: DeckCard[];
}) =>
  request<Deck>("/api/decks", {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });

export const updateDeck = (id: string, payload: Partial<Deck> & { cards?: DeckCard[] }) =>
  request<Deck>(`/api/decks/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });

export const validateDeck = (id: string) =>
  request<ValidationResult>(`/api/decks/${id}/validate`, {
    method: "POST"
  });

export const exportDeck = (id: string) =>
  request<{ deckId: string; name: string; format: string; text: string }>(`/api/decks/${id}/export/arena`);

export const exportAllDecks = () =>
  request<DeckBulkExport>("/api/decks/exports/arena");
