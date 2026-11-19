-- ConvoPilot migration 0002: commitment provenance excerpt
-- Stores the quoted source text a proposed commitment was extracted from,
-- so the approval queue can show evidence without loading the full message.

alter table public.commitments
  add column if not exists source_excerpt text;
