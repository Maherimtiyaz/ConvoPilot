import type { Metadata } from "next";

import { signOutAction } from "@/app/auth/actions";

import { Suspense } from "react";

import type { RequestContext } from "@/lib/auth/context";
import { listRecentlyDeleted } from "@/lib/services/account";
import { getTimeZone } from "@/lib/services/commitments";
import { getAiSettings } from "@/lib/services/studio";

import { LoadingState, ProtectedPage } from "../protected-page";

import { AccountDataSection } from "./account-section";
import { AiConsentToggle, StyleForm } from "./ai-settings";
import { RecentlyDeletedSection, TimeZoneSection } from "./data-sections";

async function AiSettingsSection({ ctx }: { ctx: RequestContext }) {
  const settings = await getAiSettings(ctx);
  return (
    <>
      <AiConsentToggle optIn={settings.optIn} configured={settings.configured} />
      <StyleForm style={settings.style} />
    </>
  );
}

/** Renamed zones: some runtimes still list the old names. */
const MODERN_ZONE_NAMES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "America/Godthab": "America/Nuuk",
};

/** IANA zones for the picker (rendered on the server only), always including the saved one. */
function timeZones(current: string): string[] {
  let names: string[] = [];
  try {
    names = Intl.supportedValuesOf("timeZone").map((z) => MODERN_ZONE_NAMES[z] ?? z);
  } catch {
    names = [];
  }
  return ["UTC", ...[...new Set([...names, current])].filter((z) => z !== "UTC").sort()];
}

async function PreferencesSection({ ctx }: { ctx: RequestContext }) {
  const [timeZone, deleted] = await Promise.all([getTimeZone(ctx), listRecentlyDeleted()]);
  return (
    <>
      <TimeZoneSection current={timeZone} zones={timeZones(timeZone)} />
      <RecentlyDeletedSection items={deleted} />
    </>
  );
}

export const metadata: Metadata = { title: "Settings" };

const secondaryButton =
  "rounded-xl border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-white/60";

export default function SettingsPage() {
  return (
    <ProtectedPage title="Settings" description="Your account, AI processing, writing style and sessions.">
      {(context) => (
        <div className="space-y-6">
          <section className="cp-glass rounded-3xl p-6">
            <h2 className="text-base font-semibold text-ink">Account</h2>
            <dl className="mt-3 text-sm">
              <dt className="text-ink-500">Email</dt>
              <dd className="font-medium text-ink">{context.email ?? "—"}</dd>
            </dl>
          </section>
          <Suspense fallback={<LoadingState />}>
            <AiSettingsSection ctx={context} />
          </Suspense>
          <section className="cp-glass rounded-3xl p-6">
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
          <Suspense fallback={<LoadingState />}>
            <PreferencesSection ctx={context} />
          </Suspense>
          <AccountDataSection />
        </div>
      )}
    </ProtectedPage>
  );
}
