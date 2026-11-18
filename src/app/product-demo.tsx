"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated illustration of the product's core gesture (docs/BRAND.md §2): a message arrives,
 * the ask is highlighted and cited, a commitment is proposed and approved, a reply is drafted.
 * Illustrative sample content only. Renders its final state first (complete at rest), loops only
 * when motion is allowed, and can be paused (WCAG 2.2.2).
 */
const STEPS = [
  { title: "Understand", body: "The ask is highlighted in the real message." },
  { title: "Cite", body: "Every point links to where it came from." },
  { title: "Propose", body: "A commitment is suggested, never assumed." },
  { title: "Approve", body: "You decide. Only then does it become a task." },
  { title: "Reply", body: "A draft in your voice. Never sent for you." },
] as const;

const FINAL = STEPS.length;

export function ProductDemo() {
  const [step, setStep] = useState<number>(FINAL);
  const [playing, setPlaying] = useState(true);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (!playing || reduced.current) return;
    const delay = step === FINAL ? 2600 : step === 0 ? 700 : 1300;
    const timer = window.setTimeout(() => setStep((s) => (s >= FINAL ? 0 : s + 1)), delay);
    return () => window.clearTimeout(timer);
  }, [step, playing]);

  const at = (n: number) => step >= n;
  const fade = (n: number) =>
    `transition duration-300 ease-brand ${at(n) ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`;

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
      <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-[0_12px_32px_rgba(14,27,44,0.10)] sm:p-6" aria-hidden="true">
        <div className="rounded-[10px] border border-ink-200 bg-paper px-4 py-4">
          <p className="font-mono text-xs text-ink-500">From Priya · Northwind · 12 Mar, 09:14 · sample</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink">
            Thanks for the call today. Could you{" "}
            <span
              className="rounded-[2px] bg-[linear-gradient(var(--color-marker-100),var(--color-marker-100))] bg-no-repeat px-0.5 transition-[background-size] duration-500 ease-brand"
              style={{ backgroundSize: at(1) ? "100% 100%" : "0% 100%" }}
            >
              send the revised deck by Friday
            </span>
            ? We&apos;d also like to know if the pilot can start in March.
          </p>
        </div>
        <p className={`mt-3 inline-flex rounded-[2px] bg-ink-100 px-2 py-1 font-mono text-xs text-ink-700 ${fade(2)}`}>↳ cited · message [1]</p>
        <div className="ml-9 w-[1.5px] bg-ink transition-[height] duration-500 ease-brand" style={{ height: at(3) ? 28 : 0 }} />
        <div className={`rounded-[10px] bg-ink p-4 text-white ${fade(3)}`}>
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-marker">
            <span className="cp-chisel" /> Suggested commitment
          </p>
          <p className="mt-2 text-[17px] font-semibold">Send revised deck to Priya · Friday</p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`rounded-md bg-marker px-3.5 py-2 text-sm font-semibold text-ink transition duration-150 ease-brand ${at(4) ? "scale-95 ring-4 ring-marker/30" : ""}`}>Approve</span>
            <span className="rounded-md border border-ink-500 px-3.5 py-2 text-sm">Edit</span>
            <span className={`ml-auto rounded-full px-2.5 py-1 font-mono text-xs transition-colors duration-300 ${at(4) ? "bg-success text-white" : "bg-[#3A3520] text-marker"}`}>
              {at(4) ? "Approved" : "Proposed"}
            </span>
          </div>
        </div>
        <div className={`mt-4 rounded-[10px] border border-dashed border-ink-300 p-4 ${fade(5)}`}>
          <p className="flex justify-between font-mono text-xs uppercase tracking-wider text-ink-500">
            <span>Draft · in your voice</span>
            <span>Not sent</span>
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-700">
            Hi Priya, great talking today. You&apos;ll have the revised deck by Friday, and March works on our side.
          </p>
        </div>
      </div>
      <div>
        <ol className="divide-y divide-ink-200 border-y border-ink-200">
          {STEPS.map((s, i) => (
            <li key={s.title} className={`grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-4 transition-colors duration-300 ${at(i + 1) ? "text-ink" : "text-ink-500"}`}>
              <span className="pt-0.5 font-mono text-xs">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="block font-semibold">{s.title}</span>
                <span className="text-[15px]">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="mt-5 inline-flex h-10 items-center rounded-md border border-ink-300 bg-white px-4 text-sm font-medium text-ink hover:bg-ink-100"
        >
          {playing ? "Pause animation" : "Play animation"}
        </button>
      </div>
    </div>
  );
}
