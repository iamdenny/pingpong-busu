import { z } from 'zod';

export const ttaDivisionSearchResponseSchema = z.object({
  paging: z.object({
    totalPage: z.coerce.number().int().nonnegative(),
    totalCount: z.coerce.number().int().nonnegative(),
  }),
  result: z.array(z.object({
    memberSeq: z.coerce.string().min(1),
    memberNm: z.string().min(2),
    dlPlyrGrd: z.string().regex(/^T[1-7]$/u),
    sigunguFormalNm: z.string().nullish(),
    oteamFnm: z.string().nullish(),
  })),
});

export type TtaDivisionSearchResponse = z.infer<typeof ttaDivisionSearchResponseSchema>;
