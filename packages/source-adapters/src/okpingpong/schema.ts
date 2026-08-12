import { z } from 'zod';

export const okPingpongParsedRowSchema = z.object({
  playerName: z.string().min(2),
  clubText: z.string().min(1).optional(),
  category: z.string().min(1),
  tournamentName: z.string().min(1),
  tournamentDate: z.string().date().optional(),
  eventName: z.string().min(1),
  eventType: z.enum(['singles', 'doubles', 'team', 'unknown']),
  divisionValue: z.string().optional(),
  rankText: z.string().optional(),
  partnerText: z.string().optional(),
});

export type OkPingpongParsedRow = z.infer<typeof okPingpongParsedRowSchema>;
