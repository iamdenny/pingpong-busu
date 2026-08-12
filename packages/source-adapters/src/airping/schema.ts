import { z } from 'zod';

export const airpingParsedRowSchema = z.object({
  playerName: z.string().min(2),
  clubText: z.string().min(1).optional(),
  tournamentName: z.string().min(1),
  tournamentDate: z.string().date().optional(),
  regionEvidence: z.string().optional(),
  sourceUrl: z.string().url(),
  events: z.array(z.object({
    eventName: z.string().min(1),
    eventType: z.enum(['singles', 'doubles', 'team', 'unknown']),
    divisionValue: z.string().optional(),
    rankText: z.string().optional(),
    partnerText: z.string().optional(),
  })).min(1),
});

export type AirpingParsedRow = z.infer<typeof airpingParsedRowSchema>;
