import { z } from 'zod';

export const superstarParsedRowSchema = z.object({
  externalPlayerId: z.string().min(1),
  playerName: z.string().min(2),
  tournamentDate: z.string().date(),
  tournamentName: z.string().min(1),
  eventName: z.string().min(1),
  eventType: z.enum(['singles', 'doubles', 'team', 'unknown']),
  divisionValue: z.string().optional(),
  rankText: z.string().optional(),
});

export type SuperstarParsedRow = z.infer<typeof superstarParsedRowSchema>;
