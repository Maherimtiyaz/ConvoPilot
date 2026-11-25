/**
 * Time and size limits for AI work (production-readiness review 2026-11-25). Shared by the server
 * and the Studio screen, so it has no server-only imports.
 */

/** The AI reads at most this many characters of a conversation: the newest messages that fit. */
export const AI_INPUT_CHAR_LIMIT = 50_000;

/** One model call may take this long (Opus writing ~8k tokens can take well over a minute). */
export const AI_CALL_TIMEOUT_MS = 120_000;

/** A whole AI action (calls plus a repair round) must finish within this, below the hosting limit. */
export const AI_ACTION_DEADLINE_MS = 240_000;

/** Hosting limit for pages whose Server Actions call the AI (`export const maxDuration`). */
export const AI_PAGE_MAX_DURATION_SECONDS = 300;

/** The newest messages whose bodies fit within the limit, in their original order (at least one). */
export function latestForAi<T extends { body: string }>(messages: T[], limit: number = AI_INPUT_CHAR_LIMIT): T[] {
  let total = 0;
  let start = messages.length;
  while (start > 0) {
    const next = total + messages[start - 1].body.length;
    if (next > limit && start < messages.length) break;
    total = next;
    start--;
  }
  return messages.slice(start);
}
