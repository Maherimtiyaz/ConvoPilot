import { connection } from "next/server";

/**
 * Liveness check for an uptime monitor: runs on every request (not prerendered), answers quickly,
 * reveals nothing and is never cached. It does not touch the database (a failing database shows up
 * as request.error logs instead).
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
