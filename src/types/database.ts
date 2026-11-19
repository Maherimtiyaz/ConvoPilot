export interface Contact {
  id: string;
  workspace_id: string;
  company_id: string | null;
  full_name: string;
  email: string | null;
  role: string | null;
  relationship_context: string | null;
  last_interaction_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  subject: string | null;
  source_type: "paste" | "file" | "gmail" | "manual";
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  workspace_id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  sender_name: string | null;
  sender_email: string | null;
  body: string;
  sent_at: string | null;
  provenance: "paste" | "file" | "api";
  created_at: string;
}

export interface Draft {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  content: string;
  tone: string | null;
  status: "draft" | "approved" | "discarded";
  revision_of: string | null;
  model_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Classification {
  id: string;
  workspace_id: string;
  message_id: string;
  intent: string | null;
  urgency: "low" | "medium" | "high" | "urgent" | null;
  summary: string | null;
  expected_response: string | null;
  confidence: number | null;
  model_metadata: Record<string, unknown>;
  created_at: string;
}
