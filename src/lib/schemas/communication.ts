import { z } from "zod";

export const urgencySchema = z.enum(["low", "medium", "high", "urgent"]);
export const intentSchema = z.enum([
  "question",
  "request",
  "meeting_request",
  "follow_up",
  "opportunity",
  "feedback",
  "introduction",
  "informational",
  "other",
]);

export const emailAnalysisSchema = z.object({
  intent: intentSchema,
  urgency: urgencySchema,
  summary: z.string().min(1),
  mainPoints: z.array(z.string().min(1)).min(1),
  expectedResponse: z.string().min(1),
  senderAsk: z.string().min(1),
  confidence: z.number().min(0).max(1),
});

export type EmailAnalysis = z.infer<typeof emailAnalysisSchema>;

export const toneSchema = z.enum(["direct", "warm", "formal"]);
export const lengthSchema = z.enum(["short", "medium", "long"]);

export const draftRequestSchema = z.object({
  conversationId: z.string().uuid(),
  intendedOutcome: z.string().max(2000).optional(),
  tone: toneSchema.default("direct"),
  length: lengthSchema.default("medium"),
});

export const importThreadSchema = z.object({
  subject: z.string().max(300).optional(),
  threadText: z
    .string()
    .min(20, "Paste a longer excerpt — at least 20 characters")
    .max(200_000),
  saveSender: z.boolean().default(false),
  senderName: z.string().max(200).optional(),
  senderEmail: z
    .string()
    .email()
    .optional()
    .or(z.literal("")),
});

export const saveDraftSchema = z.object({
  content: z.string().min(1).max(50_000),
  status: z.enum(["draft", "approved", "discarded"]).default("draft"),
});
