import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { signOutAction } from "@/app/auth/actions";
import { getRequestContext } from "@/lib/auth/context";

import { LoadingState } from "../protected-page";

export const metadata: Metadata = { title: "Account unavailable" };

/** Shown to a signed-in person whose workspace is not available (e.g. account deletion requested). */
export default function AccountUnavailablePage() {
  return (
    <div className="mx-auto max-w-xl">
      <Suspense fallback={<LoadingState />}>
        <Content />
      </Suspense>
    </div>
  );
}

async function Content() {
  const result = await getRequestContext();
  if (result.status === "unauthenticated") redirect("/login");
  if (result.status === "authenticated") redirect("/app");
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8">
      <h1 className="text-xl font-semibold text-slate-900">Your account isn&apos;t available</h1>
      <p className="mt-2 text-sm text-slate-600">
        This account has no active workspace — for example because its deletion was requested. Contact the ConvoPilot
        team if you think this is a mistake.
      </p>
      <form action={signOutAction} className="mt-6">
        <input type="hidden" name="scope" value="local" />
        <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium">
          Sign out
        </button>
      </form>
    </section>
  );
}
