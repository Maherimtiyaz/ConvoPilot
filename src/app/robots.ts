import type { MetadataRoute } from "next";

/** Public pages may be indexed; the private app and one-time auth pages may not. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/privacy"], disallow: ["/app", "/auth", "/invite", "/login", "/account-deleted"] }],
  };
}
