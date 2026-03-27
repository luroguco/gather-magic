import type { AppStatus, CardDetail, Deck, DeckCard, DeckListItem, Mechanic, SearchResponse, ValidationResult } from "./types";
export declare const getStatus: () => Promise<AppStatus>;
export declare const getMechanics: (options?: {
    ownedOnly?: boolean;
}) => Promise<Mechanic[]>;
export declare const searchCards: (params: URLSearchParams) => Promise<SearchResponse>;
export declare const getCard: (id: string) => Promise<CardDetail>;
export declare const uploadCollection: (file: File) => Promise<{
    importedAt: string;
    rowsRead: number;
    cardsMatched: number;
    ownedCopies: number;
    unresolvedRows: Array<Record<string, string>>;
}>;
export declare const listDecks: () => Promise<DeckListItem[]>;
export declare const getDeck: (id: string) => Promise<Deck>;
export declare const createDeck: (payload: {
    name: string;
    format: Deck["format"];
    notes?: string;
    cards?: DeckCard[];
}) => Promise<Deck>;
export declare const updateDeck: (id: string, payload: Partial<Deck> & {
    cards?: DeckCard[];
}) => Promise<Deck>;
export declare const validateDeck: (id: string) => Promise<ValidationResult>;
export declare const exportDeck: (id: string) => Promise<{
    deckId: string;
    name: string;
    format: string;
    text: string;
}>;
