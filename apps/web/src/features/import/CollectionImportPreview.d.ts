import type { CollectionImportSummary } from "../../types";
type CollectionImportPreviewProps = {
    preview: CollectionImportSummary;
    importing: boolean;
    onConfirm: () => void;
    formatImportPreviewContext: (preview: CollectionImportSummary) => string;
    formatDateTime: (value: string | null) => string;
    contextSuffix?: string | undefined;
};
export declare function CollectionImportPreview({ preview, importing, onConfirm, formatImportPreviewContext, formatDateTime, contextSuffix }: CollectionImportPreviewProps): import("react/jsx-runtime").JSX.Element;
export {};
