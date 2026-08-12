import { z } from 'zod';

export const ipingResultKindSchema = z.enum(['award', 'entry']);
export type IpingResultKind = z.infer<typeof ipingResultKindSchema>;

export const ipingParsedRowSchema = z.object({
  playerName: z.string().min(2),
  clubText: z.string().min(1).optional(),
  tournamentName: z.string().min(1),
  tournamentDate: z.string().date(),
  tournamentScale: z.string().min(1),
  eventName: z.string().min(1),
  eventType: z.enum(['singles', 'doubles', 'team', 'unknown']),
  divisionValue: z.string().min(1).optional(),
  rankText: z.string().min(1).optional(),
  sourceUrl: z.string().url(),
});

export type IpingParsedRow = z.infer<typeof ipingParsedRowSchema>;
