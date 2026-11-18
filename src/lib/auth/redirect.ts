/** Where people land after signing in when no safe destination was requested. */
export const DEFAULT_SIGNED_IN_PATH = "/app";

const SAFE_APP_PATH = /^\/app(?:\/[a-z0-9-]+)*$/;

/**
 * Returns a safe post-sign-in destination. Only plain in-app paths such as `/app` or
 * `/app/contacts` are accepted — no other origins, protocol-relative URLs, backslashes,
 * encoded characters, query strings or fragments. Anything else falls back to `/app`.
 */
export function safeNextPath(candidate: unknown): string {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 200) {
    return DEFAULT_SIGNED_IN_PATH;
  }
  return SAFE_APP_PATH.test(candidate) ? candidate : DEFAULT_SIGNED_IN_PATH;
}
