import { z } from "zod";

/** User-stated writing preferences (Settings). Stored as confirmed, origin user_stated. */
export const writingStyleSchema = z.object({
  tone: z.string().trim().max(200).optional(),
  greeting: z.string().trim().max(100).optional(),
  signOff: z.string().trim().max(100).optional(),
  avoid: z.string().trim().max(300).optional(),
  notes: z.string().trim().max(1000).optional(),
  sample: z.string().trim().max(3000).optional(),
});
export type WritingStyleInput = z.infer<typeof writingStyleSchema>;

export const draftOptionsSchema = z.object({
  tone: z.enum(["warm", "neutral", "formal"]),
  length: z.enum(["short", "medium", "long"]),
  instructions: z.string().trim().max(500).optional(),
});

export const subjectSchema = z.string().trim().max(300);
export const uuidSchema = z.uuid();
