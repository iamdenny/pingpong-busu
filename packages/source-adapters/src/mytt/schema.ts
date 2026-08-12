import { z } from 'zod';

export const myttSearchFormSchema = z.object({
  viewState: z.string().min(1),
  submitButton: z.string().startsWith('mainForm:'),
});

export const myttParsedRowSchema = z.object({
  tournamentName: z.string().min(1),
  tournamentDate: z.string().date().optional(),
  scale: z.string().min(1),
  eventName: z.string().min(1),
  eventType: z.enum(['singles', 'doubles', 'team', 'unknown']),
  rankText: z.string().optional(),
  clubText: z.string().min(1).optional(),
  playerName: z.string().min(2),
  divisionValue: z.string().optional(),
  partnerText: z.string().optional(),
});

export type MyttParsedRow = z.infer<typeof myttParsedRowSchema>;
