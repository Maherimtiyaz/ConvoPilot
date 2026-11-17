/**
 * Citation validation (docs/AGENT_DESIGN.md §6). A citation survives only if its source
 * exists, belongs to the current workspace, is not deleted, was supplied to the model in this
 * request, and any quoted text really occurs in the source.
 */
export interface Citation {
  sourceId: string;
  quote?: string;
}

export interface SuppliedSource {
  id: string;
  workspaceId: string;
  deleted: boolean;
  text: string;
}

export type DropReason = "not_supplied" | "other_workspace" | "deleted" | "quote_not_found";

export interface CitationCheck {
  valid: Citation[];
  dropped: { citation: Citation; reason: DropReason }[];
}

const normalise = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

export function validateCitations(citations: Citation[], workspaceId: string, supplied: SuppliedSource[]): CitationCheck {
  const byId = new Map(supplied.map((s) => [s.id, s]));
  const valid: Citation[] = [];
  const dropped: CitationCheck["dropped"] = [];
  const seen = new Set<string>();
  for (const citation of citations) {
    const source = byId.get(citation.sourceId);
    let reason: DropReason | null = null;
    if (!source) reason = "not_supplied";
    else if (source.workspaceId !== workspaceId) reason = "other_workspace";
    else if (source.deleted) reason = "deleted";
    else if (citation.quote !== undefined && (normalise(citation.quote) === "" || !normalise(source.text).includes(normalise(citation.quote)))) {
      reason = "quote_not_found";
    }
    if (reason) {
      dropped.push({ citation, reason });
      continue;
    }
    const key = `${citation.sourceId}\u0000${citation.quote ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      valid.push(citation);
    }
  }
  return { valid, dropped };
}

/** A claim is presentable only with at least one valid citation. */
export function keepCited<T extends { citations: Citation[] }>(items: T[], workspaceId: string, supplied: SuppliedSource[]): T[] {
  return items
    .map((item) => ({ ...item, citations: validateCitations(item.citations, workspaceId, supplied).valid }))
    .filter((item) => item.citations.length > 0);
}
