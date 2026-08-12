import { z } from 'zod';

const kakaoCafeDocumentSchema = z.object({
  title: z.string(),
  contents: z.string(),
  url: z.string().url(),
  cafename: z.string(),
  thumbnail: z.string(),
  datetime: z.string().refine((value) => !Number.isNaN(Date.parse(value)), 'invalid datetime'),
});

export const kakaoCafeSearchResponseSchema = z.object({
  meta: z.object({
    total_count: z.number().int().nonnegative(),
    pageable_count: z.number().int().nonnegative(),
    is_end: z.boolean(),
  }),
  documents: z.array(kakaoCafeDocumentSchema).max(50),
});

export type KakaoCafeDocument = z.infer<typeof kakaoCafeDocumentSchema>;
