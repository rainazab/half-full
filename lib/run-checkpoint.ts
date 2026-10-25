import { z } from "zod";
export const checkpointSchema = z.object({
  id: z.string().regex(/^[\w-]{1,100}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["running", "failed", "completed"]),
  createdAt: z.string().datetime({ offset: true }),
  runLog: z
    .array(
      z.object({
        step: z.string().max(150),
        status: z.enum(["started", "completed", "failed"]),
        message: z.string().max(4000),
        timestamp: z.string().datetime({ offset: true }),
      }),
    )
    .max(150),
  apify: z
    .object({
      runId: z.string().regex(/^[\w-]+$/),
      datasetId: z.string().regex(/^[\w-]+$/),
    })
    .optional(),
  error: z
    .object({ code: z.string().max(100), message: z.string().max(4000) })
    .optional(),
  rejectedStories: z
    .array(
      z.object({
        title: z.string().max(2000),
        url: z.string(),
        reason: z.string().max(4000),
        confidence: z.number().min(0).max(1),
        verificationStatus: z.enum(["uncertain", "rejected"]),
        centralClaim: z.string().optional(),
        reasonCode: z.string().optional(),
      }),
    )
    .max(100)
    .optional(),
  stats: z
    .object({
      candidatesFound: z.number().int().nonnegative(),
      approved: z.number().int().min(0).max(5),
      rejected: z.number().int().nonnegative(),
    })
    .optional(),
});
