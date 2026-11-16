/**
 * End-to-end checks against the real local Supabase Auth (GoTrue), Data API (PostgREST),
 * Mailpit and database. Requires `npm run db:start`.
 *
 * Covers the M1.3 security-review regressions (B1, M1, M2, M3) and EVALUATION.md
 * S1–S3, S22, S24–S34. Uses only the local stack's publishable key and local database
 * URL; the service-role key is never used here.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

const statusFile = process.env.SUPABASE_STATUS_ENV ?? "supabase/.temp/status.env";
const env = Object.fromEntries(
  readFileSync(statusFile, "utf8")
    .split("\n")
    .filter((line) => line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
    }),
) as Record<string, string>;

const API = env.API_URL;
const KEY = env.PUBLISHABLE_KEY || env.ANON_KEY;
const MAILPIT = env.MAILPIT_URL || env.INBUCKET_URL;
const DB = env.DB_URL;
const PROJECT_ID = "convopilot";

const sql = (query: string) => execFileSync("psql", [DB, "-Atqc", query], { encoding: "utf8" }).trim();
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`;
const dockerLogs = (service: string) => {
  try {
    return execFileSync("docker", ["logs", `supabase_${service}_${PROJECT_ID}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string };
    return `${failure.stdout ?? ""}${failure.stderr ?? ""}`;
  }
};

interface Response<T = unknown> {
  status: number;
  json: T;
}
interface Session {
  access_token: string;
  refresh_token: string;
  user: { id: string };
}
interface InvitationResult {
  status: string;
  invitation_id?: string;
  token?: string;
}

async function call<T = unknown>(
  path: string,
  options: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<Response<T>> {
  const response = await fetch(API + path, {
    method: options.method ?? "GET",
    headers: {
      apikey: KEY,
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json: json as T };
}
const rpc = <T = unknown>(fn: string, args: object, token?: string, headers?: Record<string, string>) =>
  call<T>(`/rest/v1/rpc/${fn}`, { method: "POST", body: args, token, headers });

const seenMessages = new Set<string>();
async function emailLinkTokenHash(email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`).then((r) =>
      r.json(),
    )) as { messages?: { ID: string }[] };
    const newest = search.messages?.[0];
    if (newest && !seenMessages.has(newest.ID)) {
      seenMessages.add(newest.ID);
      const message = (await fetch(`${MAILPIT}/api/v1/message/${newest.ID}`).then((r) => r.json())) as { Text?: string };
      const match = (message.Text ?? "").match(/[?&]token=([A-Za-z0-9_-]+)/);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("no sign-in email received");
}

/** The supported client path: signInWithOtp({ email, options: { shouldCreateUser, data } }). */
const requestMagicLink = (email: string, invitationToken?: string) =>
  call("/auth/v1/otp", {
    method: "POST",
    body: { email, create_user: true, ...(invitationToken ? { data: { invitation_token: invitationToken } } : {}) },
  });
async function completeEmailLink(email: string): Promise<Response<Session>> {
  const tokenHash = await emailLinkTokenHash(email);
  return call<Session>("/auth/v1/verify", { method: "POST", body: { type: "email", token_hash: tokenHash } });
}
async function signIn(email: string, invitationToken?: string): Promise<Session> {
  const requested = await requestMagicLink(email, invitationToken);
  expect(requested.status).toBe(200);
  const verified = await completeEmailLink(email);
  expect(verified.status).toBe(200);
  return verified.json;
}
const passwordLogin = (email: string, password: string) =>
  call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });

const userCount = (email: string) => Number(sql(`select count(*) from auth.users where email = ${quote(email)}`));
const run = randomUUID().slice(0, 8);
const email = (name: string) => `${name}-${run}@example.com`;
const ATTACKER_PASSWORD = "Attacker-Chosen-Passw0rd!";

let operator: Session;
async function invite(address: string): Promise<string> {
  const created = await rpc<InvitationResult>("create_invitation", { p_email: address }, operator.access_token);
  expect(created.status).toBe(200);
  expect(created.json.status).toBe("created");
  return created.json.token as string;
}

beforeAll(async () => {
  // DBA-only bootstrap (docs/DATABASE.md §3.4): the first operator's invitation and
  // operator grant are created directly in SQL, never through the application.
  const operatorEmail = email("operator");
  const bootstrapToken = `bootstrap-${randomUUID()}`;
  sql(`insert into app_private.invitations (email_normalized, token_hash, created_by, expires_at)
       values (${quote(operatorEmail)}, extensions.digest(${quote(bootstrapToken)}, 'sha256'),
               gen_random_uuid(), now() + interval '1 day')`);
  operator = await signIn(operatorEmail, bootstrapToken);
  sql(`insert into app_private.platform_operators (user_id) values (${quote(operator.user.id)})`);
}, 60_000);

describe("B1 — invitation-bound, passwordless account creation", () => {
  it("valid invitation token + magic link: account created, provisioned, invitation consumed", async () => {
    const address = email("valid");
    const token = await invite(address);
    const session = await signIn(address, token);
    expect(session.access_token).toBeTruthy();
    const state = sql(`select
        (select count(*) from public.workspace_members where user_id = ${quote(session.user.id)} and role = 'owner') || ',' ||
        (select count(*) from public.workspace_settings s join public.workspace_members m using (workspace_id)
          where m.user_id = ${quote(session.user.id)}) || ',' ||
        (select count(*) from app_private.invitations where email_normalized = ${quote(address)} and consumed_by = ${quote(session.user.id)}) || ',' ||
        (select (encrypted_password is null)::text from auth.users where id = ${quote(session.user.id)})`);
    expect(state).toBe("1,1,1,true");
  });

  it("verified invitation state without the raw token: rejected", async () => {
    const address = email("verified-no-token");
    const token = await invite(address);
    expect((await rpc("verify_invitation", { p_token: token, p_email: address })).json).toBe(true);
    expect((await requestMagicLink(address)).status).toBe(403);
    expect(userCount(address)).toBe(0);
  });

  it("missing token: rejected", async () => {
    const address = email("missing-token");
    await invite(address);
    expect((await requestMagicLink(address)).status).toBe(403);
    expect(userCount(address)).toBe(0);
  });

  it("token bound to another email: rejected", async () => {
    const owner = email("pair-owner");
    const other = email("pair-other");
    const ownerToken = await invite(owner);
    await invite(other);
    expect((await requestMagicLink(other, ownerToken)).status).toBe(403);
    expect(userCount(other)).toBe(0);
    expect(sql(`select consumed_at is null from app_private.invitations where email_normalized = ${quote(owner)}`)).toBe("t");
  });

  it("password sign-up without a token: rejected", async () => {
    const address = email("pw-no-token");
    await invite(address);
    const response = await call("/auth/v1/signup", { method: "POST", body: { email: address, password: ATTACKER_PASSWORD } });
    expect(response.status).toBe(403);
    expect(userCount(address)).toBe(0);
    expect((await passwordLogin(address, ATTACKER_PASSWORD)).status).toBe(400);
  });

  it("password sign-up WITH a valid token: no password and no session are granted", async () => {
    // GoTrue v2.197 cannot distinguish password sign-up from OTP sign-up at creation
    // time (identical hook payload and INSERT). The account is created for the token
    // holder, but passwordless and unconfirmed: no session, no usable password.
    const address = email("pw-with-token");
    const token = await invite(address);
    const response = await call<{ access_token?: string }>("/auth/v1/signup", {
      method: "POST",
      body: { email: address, password: ATTACKER_PASSWORD, data: { invitation_token: token } },
    });
    expect(response.json?.access_token).toBeUndefined();
    expect(sql(`select coalesce(bool_and(encrypted_password is null)::text, 'no-user') from auth.users where email = ${quote(address)}`)).toMatch(/^(true|no-user)$/);
    expect((await passwordLogin(address, ATTACKER_PASSWORD)).status).toBe(400);
  });

  it("password login against a passwordless account: rejected", async () => {
    const address = email("pw-login");
    const token = await invite(address);
    await signIn(address, token);
    expect((await passwordLogin(address, ATTACKER_PASSWORD)).status).toBe(400);
    expect((await passwordLogin(address, "")).status).toBeGreaterThanOrEqual(400);
  });

  it("setting a password (directly after login, and after a recovery link) cannot enable password auth", async () => {
    const address = email("pw-set");
    const token = await invite(address);
    const session = await signIn(address, token);
    const direct = await call("/auth/v1/user", { method: "PUT", token: session.access_token, body: { password: ATTACKER_PASSWORD } });
    expect(direct.status).toBeGreaterThanOrEqual(400);

    expect((await call("/auth/v1/recover", { method: "POST", body: { email: address } })).status).toBe(200);
    const recovered = await completeEmailLink(address);
    expect(recovered.status).toBe(200);
    const viaRecovery = await call("/auth/v1/user", {
      method: "PUT",
      token: recovered.json.access_token,
      body: { password: ATTACKER_PASSWORD },
    });
    expect(viaRecovery.status).toBeGreaterThanOrEqual(400);

    expect(sql(`select (encrypted_password is null)::text from auth.users where email = ${quote(address)}`)).toBe("true");
    expect((await passwordLogin(address, ATTACKER_PASSWORD)).status).toBe(400);
  });

  it("existing user magic-link login keeps working (no token needed)", async () => {
    const address = email("returning");
    const token = await invite(address);
    const first = await signIn(address, token);
    const second = await signIn(address);
    expect(second.user.id).toBe(first.user.id);
    expect(userCount(address)).toBe(1);
  });

  it("concurrent sign-up attempts consume the invitation exactly once", async () => {
    const address = email("race");
    const token = await invite(address);
    const attempts = await Promise.all(Array.from({ length: 6 }, () => requestMagicLink(address, token)));
    expect(attempts.some((attempt) => attempt.status === 200)).toBe(true);
    expect(userCount(address)).toBe(1);
    const state = sql(`select
        (select count(*) from public.workspace_members m join auth.users u on u.id = m.user_id where u.email = ${quote(address)}) || ',' ||
        (select count(*) from app_private.invitations where email_normalized = ${quote(address)} and consumed_at is not null)`);
    expect(state).toBe("1,1");
  });

  it("failed sign-up leaves no partial records and does not consume the invitation", async () => {
    const address = email("rollback");
    const token = await invite(address);
    sql(`alter table public.workspaces add constraint zz_force_fail check (name <> 'Personal') not valid`);
    try {
      expect((await requestMagicLink(address, token)).status).toBeGreaterThanOrEqual(400);
    } finally {
      sql(`alter table public.workspaces drop constraint zz_force_fail`);
    }
    expect(userCount(address)).toBe(0);
    expect(sql(`select count(*) from public.profiles p where not exists (select 1 from auth.users u where u.id = p.user_id)`)).toBe("0");
    expect(sql(`select consumed_at is null from app_private.invitations where email_normalized = ${quote(address)}`)).toBe("t");
  });

  it("the raw token is absent from every Auth/app text and JSON column and from service logs", async () => {
    // Scans every text/varchar/json/jsonb column of every base table in the auth,
    // public and app_private schemas for this test's unique token (so unrelated
    // records cannot affect the result). Failure output lists column names only.
    const scanForToken = (secret: string) => {
      const union = sql(`select string_agg(format(
          'select %L as col, count(*) as n from %I.%I where %I::text like %L',
          c.table_schema || '.' || c.table_name || '.' || c.column_name,
          c.table_schema, c.table_name, c.column_name, ${quote(`%${secret}%`)}), ' union all ')
        from information_schema.columns c
        join information_schema.tables t using (table_schema, table_name)
       where c.table_schema in ('auth', 'public', 'app_private')
         and t.table_type = 'BASE TABLE'
         and c.data_type in ('text', 'character varying', 'jsonb', 'json')`);
      return sql(`select coalesce(string_agg(col, ','), 'none') from (${union}) s where n > 0`);
    };
    const scannedColumns = Number(sql(`select count(*) from information_schema.columns c
        join information_schema.tables t using (table_schema, table_name)
       where c.table_schema in ('auth', 'public', 'app_private') and t.table_type = 'BASE TABLE'
         and c.data_type in ('text', 'character varying', 'jsonb', 'json')`));
    expect(scannedColumns).toBeGreaterThan(50);

    const address = email("no-trace");
    const token = await invite(address);

    // 1. Magic-link sign-up request (GoTrue inserts the user and the identity).
    expect((await requestMagicLink(address, token)).status).toBe(200);
    expect(scanForToken(token)).toBe("none");

    // 2. Email confirmation (GoTrue rewrites user metadata and identity_data).
    const confirmed = await completeEmailLink(address);
    expect(confirmed.status).toBe(200);
    expect(scanForToken(token)).toBe("none");

    // 3. Returning-user magic-link login.
    const returning = await signIn(address);
    expect(returning.user.id).toBe(confirmed.json.user.id);
    expect(scanForToken(token)).toBe("none");

    // 4. Metadata update that tries to reintroduce the token.
    const update = await call("/auth/v1/user", {
      method: "PUT",
      token: returning.access_token,
      body: { data: { invitation_token: token, display_name_hint: "kept" } },
    });
    expect(update.status).toBe(200);
    expect(scanForToken(token)).toBe("none");
    expect(sql(`select raw_user_meta_data ->> 'display_name_hint' from auth.users where id = ${quote(returning.user.id)}`)).toBe("kept");
    expect(sql(`select (identity_data ->> 'email_verified') from auth.identities where user_id = ${quote(returning.user.id)}`)).toBe("true");

    for (const service of ["auth", "rest", "kong", "db"]) {
      expect(dockerLogs(service).includes(token)).toBe(false);
    }
  });
});

describe("invitation management (M1, M2, M3)", () => {
  let member: Session;

  beforeAll(async () => {
    const address = email("member");
    member = await signIn(address, await invite(address));
  }, 60_000);

  it("M1: a non-operator denial returns a typed result and its audit event persists", async () => {
    const before = Number(sql(`select count(*) from public.audit_events where action = 'invitation.create_denied' and actor_user_id = ${quote(member.user.id)}`));
    const denied = await rpc<InvitationResult>("create_invitation", { p_email: email("x") }, member.access_token);
    expect(denied.status).toBe(200);
    expect(denied.json).toEqual({ status: "not_authorized" });
    const after = Number(sql(`select count(*) from public.audit_events where action = 'invitation.create_denied' and actor_user_id = ${quote(member.user.id)}`));
    expect(after - before).toBe(1);
    expect((await rpc("create_invitation", { p_email: email("y") })).status).toBe(401);
  });

  it("ignores operator claims forged in user metadata", async () => {
    sql(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"platform_operator": true}' where id = ${quote(member.user.id)}`);
    const refreshed = await call<Session>("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: member.refresh_token },
    });
    const claims = JSON.parse(Buffer.from(refreshed.json.access_token.split(".")[1], "base64url").toString());
    expect(claims.user_metadata.platform_operator).toBe(true);
    const forged = await rpc<InvitationResult>("create_invitation", { p_email: email("z") }, refreshed.json.access_token);
    expect(forged.json.status).toBe("not_authorized");
    member = refreshed.json;
  });

  it("M2: an expired invitation can be replaced; an active one still blocks duplicates", async () => {
    const address = email("reinvite");
    await invite(address);
    const duplicate = await rpc<InvitationResult>("create_invitation", { p_email: address }, operator.access_token);
    expect(duplicate.json.status).toBe("already_invited");
    sql(`update app_private.invitations set created_at = now() - interval '9 days', expires_at = now() - interval '1 day'
          where email_normalized = ${quote(address)}`);
    const replacement = await rpc<InvitationResult>("create_invitation", { p_email: address }, operator.access_token);
    expect(replacement.json.status).toBe("created");
    expect(sql(`select count(*) filter (where revoked_reason = 'expired_replaced') || ',' ||
                       count(*) filter (where consumed_at is null and revoked_at is null)
                  from app_private.invitations where email_normalized = ${quote(address)}`)).toBe("1,1");
    // The replacement invitation works end to end.
    await signIn(address, replacement.json.token);
  });

  it("M2: a revoked invitation can be followed by a new one, and the revoked token no longer works", async () => {
    const address = email("revoked");
    const created = await rpc<InvitationResult>("create_invitation", { p_email: address }, operator.access_token);
    const revoked = await rpc<InvitationResult>("revoke_invitation", { p_invitation_id: created.json.invitation_id }, operator.access_token);
    expect(revoked.json.status).toBe("revoked");
    expect((await requestMagicLink(address, created.json.token)).status).toBe(403);
    const again = await rpc<InvitationResult>("create_invitation", { p_email: address }, operator.access_token);
    expect(again.json.status).toBe("created");
  });

  it("M2: concurrent invitation creation for one email creates exactly one invitation", async () => {
    const address = email("concurrent-invite");
    const results = await Promise.all(
      Array.from({ length: 6 }, () => rpc<InvitationResult>("create_invitation", { p_email: address }, operator.access_token)),
    );
    const statuses = results.map((result) => result.json.status).sort();
    expect(statuses.filter((status) => status === "created")).toHaveLength(1);
    expect(statuses.filter((status) => status === "already_invited")).toHaveLength(5);
    expect(sql(`select count(*) from app_private.invitations where email_normalized = ${quote(address)}`)).toBe("1");
  });

  it("M3: 60 anonymous invalid-token verifications add no audit rows", async () => {
    const before = Number(sql(`select count(*) from public.audit_events`));
    const results = await Promise.all(
      Array.from({ length: 60 }, (_, i) => rpc("verify_invitation", { p_token: `bogus-${i}`, p_email: "nobody@example.com" })),
    );
    expect(results.every((result) => result.status === 200 && result.json === false)).toBe(true);
    expect(Number(sql(`select count(*) from public.audit_events`)) - before).toBe(0);
  });
});

describe("isolation, API exposure, sessions and deletion", () => {
  let userA: Session;
  let userB: Session;

  beforeAll(async () => {
    const a = email("user-a");
    const b = email("user-b");
    userA = await signIn(a, await invite(a));
    userB = await signIn(b, await invite(b));
  }, 60_000);

  it("isolates workspaces between users", async () => {
    const workspacesA = (await call<{ id: string }[]>("/rest/v1/workspaces?select=id", { token: userA.access_token })).json;
    const workspacesB = (await call<{ id: string }[]>("/rest/v1/workspaces?select=id", { token: userB.access_token })).json;
    expect(workspacesA).toHaveLength(1);
    expect(workspacesB).toHaveLength(1);
    expect(workspacesA[0].id).not.toBe(workspacesB[0].id);
    expect((await call(`/rest/v1/workspaces?id=eq.${workspacesB[0].id}`, { token: userA.access_token })).json).toEqual([]);
    const renameOther = await call(`/rest/v1/workspaces?id=eq.${workspacesB[0].id}`, {
      method: "PATCH",
      token: userA.access_token,
      body: { name: "pwned" },
      headers: { Prefer: "return=representation" },
    });
    expect(renameOther.json).toEqual([]);
    const joinOther = await call("/rest/v1/workspace_members", {
      method: "POST",
      token: userA.access_token,
      body: { workspace_id: workspacesB[0].id, user_id: userA.user.id, role: "owner" },
    });
    expect(joinOther.status).toBe(403);
  });

  it("does not expose app_private, internal functions or GraphQL", async () => {
    const privateTable = await call("/rest/v1/invitations", { token: userA.access_token, headers: { "Accept-Profile": "app_private" } });
    expect(privateTable.status).toBe(406);
    for (const fn of [
      "is_workspace_member",
      "is_platform_operator",
      "write_audit",
      "before_user_created_hook",
      "bind_invitation_on_user_insert",
      "enforce_passwordless_on_user_update",
      "handle_new_user",
    ]) {
      expect((await rpc(fn, {}, userA.access_token)).status).toBeGreaterThanOrEqual(400);
      expect((await rpc(fn, {}, userA.access_token, { "Content-Profile": "app_private" })).status).toBeGreaterThanOrEqual(400);
    }
    const graphql = await call("/graphql/v1", { method: "POST", token: userA.access_token, body: { query: "{ __schema { types { name } } }" } });
    expect(graphql.status).toBeGreaterThanOrEqual(400);
  });

  it("revokes refresh tokens on global sign-out", async () => {
    expect((await call("/auth/v1/logout?scope=global", { method: "POST", token: userB.access_token })).status).toBe(204);
    const refresh = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: userB.refresh_token } });
    expect(refresh.status).toBeGreaterThanOrEqual(400);
  });

  it("removes data access immediately when account deletion is requested", async () => {
    expect((await rpc("request_account_deletion", {}, userA.access_token)).status).toBe(204);
    expect((await call("/rest/v1/workspaces?select=id", { token: userA.access_token })).json).toEqual([]);
    expect((await call("/rest/v1/workspace_members?select=user_id", { token: userA.access_token })).json).toEqual([]);
    expect(sql(`select deletion_requested_at is not null from public.profiles where user_id = ${quote(userA.user.id)}`)).toBe("t");
  });
});
