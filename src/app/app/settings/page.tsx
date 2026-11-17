import type { Metadata } from "next";

import { signOutAction } from "@/app/auth/actions";

import { Suspense } from "react";

import type { RequestContext } from "@/lib/auth/context";
import { getAiSettings } from "@/lib/services/studio";

import { LoadingState, ProtectedPage } from "../protected-page";

import { AiConsentToggle, StyleForm } from "./ai-settings";

async function AiSettingsSection({ ctx }: { ctx: RequestContext }) {
  const settings = await getAiSettings(ctx);
  return (
    <>
      <AiConsentToggle optIn={settings.optIn} configured={settings.configured} />
      <StyleForm style={settings.style} />
    </>
  );
}

export const metadata: Metadata = { title: "Settings" };

const secondaryButton =
  "rounded-md border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-paper";

export default function SettingsPage() {
  return (
    <ProtectedPage title="Settings" description="Your account, AI processing, writing style and sessions.">
      {(context) => (
        <div className="space-y-6">
          <section className="rounded-[10px] border border-ink-200 bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Account</h2>
            <dl className="mt-3 text-sm">
              <dt className="text-ink-500">Email</dt>
              <dd className="font-medium text-ink">{context.email ?? "—"}</dd>
            </dl>
          </section>
          <Suspense fallback={<LoadingState />}>
            <AiSettingsSection ctx={context} />
          </Suspense>
          <section className="rounded-[10px] border border-ink-200 bg-white p-6">
            <h2 className="text-base font-semibold text-ink">Sign out</h2>
            <p className="mt-1 text-sm text-ink-700">
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
