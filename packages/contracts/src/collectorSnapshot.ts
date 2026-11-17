import { z } from "zod";

export const COLLECTOR_SNAPSHOT_VERSION = 1 as const;
export const MAX_COLLECTION_ENTRIES = 100_000;
export const MAX_CARD_QUANTITY = 10_000;
export const MAX_TOTAL_QUANTITY = 10_000_000;

const arenaCardIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/, "Collection keys must be positive numeric Arena card ids.");

const quantitySchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_CARD_QUANTITY);

const collectorDiagnosticsSchema = z
  .object({
    source: z.string().trim().min(1).max(500),
    warnings: z.array(z.string().trim().min(1).max(1_000)).max(100).default([])
  })
  .strict();

export const collectorSnapshotV1Schema = z
  .object({
    snapshotVersion: z.literal(COLLECTOR_SNAPSHOT_VERSION),
    status: z.literal("complete"),
    capturedAt: z.iso.datetime({ offset: true }),
    platform: z.string().trim().min(1).max(100),
    collectorVersion: z.string().trim().min(1).max(200),
    mtgaPid: z.number().int().positive(),
    mtgaBuild: z.string().trim().min(1).max(200).optional(),
    entryCount: z.number().int().min(1).max(MAX_COLLECTION_ENTRIES),
    totalQuantity: z.number().int().min(1).max(MAX_TOTAL_QUANTITY),
    collection: z.record(arenaCardIdSchema, quantitySchema),
    diagnostics: collectorDiagnosticsSchema
  })
  .strict()
  .superRefine((snapshot, context) => {
    const capturedAt = Date.parse(snapshot.capturedAt);
    if (capturedAt > Date.now() + 5 * 60 * 1_000) {
      context.addIssue({
        code: "custom",
        path: ["capturedAt"],
        message: "capturedAt cannot be more than five minutes in the future."
      });
    }

    const entries = Object.entries(snapshot.collection);
    if (entries.length !== snapshot.entryCount) {
      context.addIssue({
        code: "custom",
        path: ["entryCount"],
        message: `entryCount is ${snapshot.entryCount}, but collection contains ${entries.length} entries.`
      });
    }

    const totalQuantity = entries.reduce((sum, [, quantity]) => sum + quantity, 0);
    if (totalQuantity !== snapshot.totalQuantity) {
      context.addIssue({
        code: "custom",
        path: ["totalQuantity"],
        message: `totalQuantity is ${snapshot.totalQuantity}, but collection sums to ${totalQuantity}.`
      });
    }
  });

export type CollectorSnapshotV1 = z.infer<typeof collectorSnapshotV1Schema>;

export const parseCollectorSnapshotV1 = (value: unknown): CollectorSnapshotV1 =>
  collectorSnapshotV1Schema.parse(value);
