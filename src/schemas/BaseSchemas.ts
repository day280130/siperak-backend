import { z } from "zod";

export const baseCachedQuerySchema = z.object({
  maxPage: z.number(),
  dataCount: z.number(),
});

export const baseQuerySchema = z.object({
  sort: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().gte(0).default(0),
  limit: z.coerce.number().gte(1).default(2),
});
