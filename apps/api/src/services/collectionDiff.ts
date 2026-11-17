export type CollectionDiff = {
  addedTitles: number;
  removedTitles: number;
  changedTitles: number;
  unchangedTitles: number;
};

export const isSuspiciousCollectionDiff = (diff: CollectionDiff) => {
  const currentTitles = diff.changedTitles + diff.unchangedTitles + diff.removedTitles;
  const materiallyChangedTitles = diff.changedTitles + diff.removedTitles;
  return (
    currentTitles >= 20 &&
    (diff.removedTitles >= Math.ceil(currentTitles * 0.25) ||
      materiallyChangedTitles >= Math.ceil(currentTitles * 0.5))
  );
};

export class CollectionImportConfirmationRequiredError extends Error {
  readonly statusCode = 409;

  constructor(readonly diff: CollectionDiff) {
    super(
      "This snapshot would remove or change a large portion of the current collection. Preview the changes and acknowledge the replacement before continuing."
    );
    this.name = "CollectionImportConfirmationRequiredError";
  }
}
