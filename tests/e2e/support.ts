/**
 * Helpers for end-to-end tests against the local Supabase stack (`npm run db:start`) and the
 * built app (`npm run build`). Test data is synthetic (example.com addresses only).
 */
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export function readStatusEnv(): Record<string, string> {
  const file = process.env.SUPABASE_STATUS_ENV ?? "supabase/.temp/status.env";
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
      }),
  );
}

const env = readStatusEnv();
const MAILPIT = env.MAILPIT_URL || env.INBUCKET_URL;

export const sql = (query: string) => execFileSync("psql", [env.DB_URL, "-Atqc", query], { encoding: "utf8" }).trim();
export const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;

const run = randomUUID().slice(0, 8);
export const testEmail = (name: string) => `e2e-${name}-${run}@example.com`;

/** Creates an invitation directly in the database (the operator console arrives in M1.5). */
export function createInvitation(email: string): string {
  const token = randomBytes(32).toString("base64url");
  sql(`insert into app_private.invitations (email_normalized, token_hash, created_by, expires_at)
       values (${quote(email)}, extensions.digest(${quote(token)}, 'sha256'), gen_random_uuid(), now() + interval '1 day')`);
  return token;
}

const seen = new Set<string>();
/** Returns the app link from the newest unseen email to `email` (e.g. http://127.0.0.1:3000/auth/confirm#th=…). */
export async function latestEmailLink(email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const search = (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then((r) => r.json())) as {
      messages?: { ID: string }[];
    };
    const newest = search.messages?.[0];
    if (newest && !seen.has(newest.ID)) {
      seen.add(newest.ID);
      const message = (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`).then((r) => r.json())) as { HTML?: string };
      const match = (message.HTML ?? "").match(/href="([^"]*\/auth\/confirm#th=[A-Za-z0-9_-]+)"/);
      if (match) return match[1].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("no sign-in email received");
}

export async function emailCount(email: string): Promise<number> {
  const search = (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then((r) => r.json())) as {
    messages_count?: number;
  };
  return search.messages_count ?? 0;
}
