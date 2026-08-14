import { z } from "zod";

export const memberSearchParsedRowSchema = z.object({
  playerName: z.string().min(2),
  clubText: z.string().min(1),
  tournamentName: z.string().min(1),
  tournamentDate: z.string().date().optional(),
  events: z
    .array(
      z.object({
        eventName: z.string().min(1),
        eventType: z.enum(["singles", "doubles", "team", "unknown"]),
        divisionValue: z.string().optional(),
        rankText: z.string().optional(),
        partnerText: z.string().optional(),
        sourceUrl: z.string().url(),
      }),
    )
    .min(1),
});

export type MemberSearchParsedRow = z.infer<typeof memberSearchParsedRowSchema>;
