import type {
  AppStatus,
  CardDetail,
  Deck,
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

const jsonHeaders = {
  "Content-Type": "application/json"
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
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

export const getCard = (id: string) => request<CardDetail>(`/api/cards/${id}`);

export const uploadCollection = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<{
    importedAt: string;
    rowsRead: number;
    cardsMatched: number;
    ownedCopies: number;
    unresolvedRows: Array<Record<string, string>>;
  }>("/api/imports/collection-csv", {
    method: "POST",
    body: formData
  });
};

export const previewUntappedCollection = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<UntappedImportSummary>("/api/imports/untapped-json/preview", {
    method: "POST",
    body: formData
  });
};

export const importUntappedCollection = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<UntappedImportSummary>("/api/imports/untapped-json", {
    method: "POST",
    body: formData
  });
};

export const getUntappedHelperStatus = () =>
  request<UntappedCaptureStatus>("/api/imports/untapped-helper/status");

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

export const importLatestUntappedCapture = () =>
  request<UntappedCaptureImportSummary>("/api/imports/untapped-helper/import-latest", {
    method: "POST"
  });

export const listDecks = async () =>
  (await request<{ items: DeckListItem[] }>("/api/decks")).items;

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
