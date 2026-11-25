import type { Instrumentation } from "next";

/**
 * Reports server errors to the logs without content: the route (no query string), the request
 * method, the kind of route and the error digest that matches the generic error page.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log, pathOnly } = await import("@/lib/observability/log");
  const digest = typeof error === "object" && error !== null && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
  const method = request.method.toUpperCase();
  log("error", {
    event: "request.error",
    route: pathOnly(context.routePath ?? request.path),
    method: (["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const).find((m) => m === method),
    kind: `${context.routerKind}:${context.routeType}`.toLowerCase().replace(/[^a-z0-9_.:-]/g, "-").slice(0, 60),
    digest: digest && /^[A-Za-z0-9_-]{1,64}$/.test(digest) ? digest : undefined,
  });
};
