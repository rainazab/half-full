import { z } from "zod";
export const provenanceSchema = z.object({
  actorId: z.string().regex(/^[\w~/-]+$/),
  runId: z.string().regex(/^[\w-]+$/),
  datasetId: z.string().regex(/^[\w-]+$/),
  itemIndex: z.number().int().nonnegative(),
  retrievedAt: z.string().datetime({ offset: true }),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  relationship: z.enum([
    "discovery",
    "linked-original",
    "investigation-search",
  ]),
});
export type Provenance = z.infer<typeof provenanceSchema>;
export function parseProvenance(value: unknown): Provenance | undefined {
  const result = provenanceSchema.safeParse(value);
  return result.success ? result.data : undefined;
}
