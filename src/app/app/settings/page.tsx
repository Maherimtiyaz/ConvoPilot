import type { Metadata } from "next";

import { signOutAction } from "@/app/auth/actions";

import { ProtectedPage } from "../protected-page";

export const metadata: Metadata = { title: "Settings" };

const secondaryButton =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50";

export default function SettingsPage() {
  return (
    <ProtectedPage title="Settings" description="Your account and sessions.">
      {(context) => (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">Account</h2>
            <dl className="mt-3 text-sm">
              <dt className="text-slate-500">Email</dt>
              <dd className="font-medium text-slate-900">{context.email ?? "—"}</dd>
            </dl>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">Sign out</h2>
            <p className="mt-1 text-sm text-slate-600">
              Sign out of this browser, or of every device where you&apos;re signed in.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <form action={signOutAction}>
                <input type="hidden" name="scope" value="local" />
                <button type="submit" className={secondaryButton}>
                  Sign out
                </button>
              </form>
              <form action={signOutAction}>
                <input type="hidden" name="scope" value="global" />
                <button type="submit" className={secondaryButton}>
                  Sign out everywhere
                </button>
              </form>
            </div>
          </section>
        </div>
      )}
    </ProtectedPage>
  );
}
