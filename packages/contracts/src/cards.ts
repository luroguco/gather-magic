import { z } from "zod";

export const cardPrintSchema = z
  .object({
    printId: z.string(),
    arenaId: z.number().int().nullable(),
    setCode: z.string(),
    collectorNumber: z.string().nullable(),
    imageUrl: z.string().nullable(),
    releasedAt: z.string().nullable()
  })
  .strict();

export type CardPrintDto = z.infer<typeof cardPrintSchema>;
