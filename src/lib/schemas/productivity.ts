import { z } from "zod";

export const commitmentOwnerSchema = z.enum(["me", "them"]);

export const commitmentProposalSchema = z
  .object({
    owner: commitmentOwnerSchema,
    description: z.string().min(1).max(2000),
    /** ISO date (yyyy-mm-dd) or null when absent/ambiguous. */
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be an ISO date or null")
      .nullable(),
    dueDateAmbiguous: z.boolean(),
    confidence: z.number().min(0).max(1),
    /** Verbatim excerpt from the conversation that evidences this commitment. */
    sourceExcerpt: z.string().min(1).max(2000),
  })
  // Memory-integrity rule: an ambiguous timeframe must never carry a hard
  // due date — ambiguity is surfaced to the user instead.
  .refine((p) => !(p.dueDateAmbiguous && p.dueDate !== null), {
    message: "dueDate must be null when dueDateAmbiguous is true",
    path: ["dueDate"],
  });

export const extractedCommitmentsSchema = z.object({
  commitments: z.array(commitmentProposalSchema).max(20),
});

export type CommitmentProposal = z.infer<typeof commitmentProposalSchema>;

export const extractCommitmentsRequestSchema = z.object({
  conversationId: z.string().uuid(),
});

export const taskCreateSchema = z.object({
  title: z.string().min(1).max(500),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  contactId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
});

export const taskUpdateSchema = z.object({
  status: z.enum(["todo", "in_progress", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  title: z.string().min(1).max(500).optional(),
});

export const commitmentActionSchema = z.object({
  action: z.enum(["approve", "dismiss", "complete"]),
});
