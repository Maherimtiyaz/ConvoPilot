"use client";

import { useState, useSyncExternalStore, useTransition } from "react";

import type { DeletedItem } from "@/lib/services/account";

import { restoreItemAction, setTimeZoneAction } from "./account-actions";

const secondary = "rounded-xl border border-ink-300 bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-white/60 disabled:opacity-50";
const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const noop = () => () => undefined;
const deviceZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

/** "Today", "overdue" and "due this week" follow this time zone. */
export function TimeZoneSection({ current, zones }: { current: string; zones: string[] }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // The device's zone is only known in the browser; the server renders without it (no hydration mismatch).
  const detected = useSyncExternalStore(noop, deviceZone, () => null);
  const save = (tz: string) =>
    start(async () => {
      const r = await setTimeZoneAction(tz);
      setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: "Saved" });
      if (!r.error) setValue(tz);
    });

  return (
    <section aria-labelledby="tz-heading" className="cp-glass rounded-3xl p-6">
      <h2 id="tz-heading" className="text-base font-semibold text-ink">
        Time zone
      </h2>
      <p className="mt-1 text-sm text-ink-700">Used to decide what is due today and what is overdue.</p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm font-medium">
          <span className="block">Your time zone</span>
          <select value={value} onChange={(e) => setValue(e.target.value)} className="h-10 rounded-xl border border-ink-300 bg-white px-3">
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={pending || value === current} onClick={() => save(value)} className={secondary}>
          Save time zone
        </button>
        {detected && detected !== current && detected !== value && (
          <button type="button" disabled={pending} onClick={() => save(detected)} className="text-sm font-medium text-route hover:underline">
            Use {detected.replaceAll("_", " ")} (this device)
          </button>
        )}
        {message && (
          <span role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-success" : "text-error"}`}>
            {message.text}
          </span>
        )}
      </div>
    </section>
  );
}

/** Items deleted in the last 30 days; the user can bring them back until they are erased. */
export function RecentlyDeletedSection({ items }: { items: DeletedItem[] }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <section aria-labelledby="deleted-heading" className="cp-glass rounded-3xl p-6">
      <h2 id="deleted-heading" className="text-base font-semibold text-ink">
        Recently deleted
      </h2>
      <p className="mt-1 text-sm text-ink-700">Deleted conversations and contacts are kept for 30 days, then permanently erased. Restore them here until then.</p>
      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-3 text-sm ${message.ok ? "text-success" : "text-error"}`}>
          {message.text}
        </p>
      )}
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">Nothing deleted in the last 30 days.</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-200">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block font-medium">{item.title}</span>
                <span className="block font-mono text-xs text-ink-500">
                  {item.kind} · erased on {dateFormat.format(new Date(item.erase_at))}
                </span>
              </span>
              <button
                type="button"
                disabled={pending}
                aria-label={`Restore ${item.kind}: ${item.title}`}
                onClick={() =>
                  start(async () => {
                    const r = await restoreItemAction(item.kind, item.id);
                    setMessage(r.error ? { ok: false, text: r.error } : { ok: true, text: r.note ?? `Restored “${item.title}”.` });
                  })
                }
                className={secondary}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
