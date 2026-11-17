/**
 * Reads a token from a URL fragment such as `#th=abc` or `#t=abc`.
 *
 * Tokens are delivered in the fragment because browsers never send fragments to servers, so the
 * token cannot appear in server logs or Referer headers. Callers must remove the fragment from
 * the address bar immediately after reading it (`history.replaceState`).
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

export function readFragmentToken(hash: string, key: "th" | "t"): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (raw.length === 0 || raw.length > 1000) {
    return null;
  }
  const value = new URLSearchParams(raw).get(key);
  return value !== null && TOKEN_PATTERN.test(value) ? value : null;
}

export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
