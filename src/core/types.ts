import { z } from "zod";

export type Mode = "local" | "startup";

export const RawSignalSchema = z.object({
  kind: z.string().min(1),
  value: z.unknown(),
});
export type RawSignal = z.infer<typeof RawSignalSchema>;

export const RawCandidateSchema = z.object({
  mode: z.enum(["local", "startup"]),
  identityKey: z.string().min(1),
  name: z.string().min(1),
  website: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  source: z.string().min(1),
  sourceUrl: z.string().nullable().optional(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  signals: z.array(RawSignalSchema).default([]),
  contacts: z.array(z.object({ type: z.string(), value: z.string() })).default([]),
});
export type RawCandidate = z.infer<typeof RawCandidateSchema>;
