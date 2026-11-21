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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center">
      <div className="cp-glass-strong rounded-[28px] p-4 sm:p-5" aria-hidden="true">
        <div className="rounded-2xl bg-white/85 px-5 py-4">
          <p className="font-mono text-[11px] text-ink-500">From Priya · Northwind · 12 Mar, 09:14 · sample</p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink">
            Thanks for the call today. Could you{" "}
            <span
              className="rounded-md bg-[linear-gradient(90deg,var(--color-aurora-lilac),var(--color-aurora-peach))] bg-no-repeat px-1 transition-[background-size] duration-700 ease-brand"
              style={{ backgroundSize: at(1) ? "100% 100%" : "0% 100%" }}
            >
              send the revised deck by Friday
            </span>
            ? We&apos;d also like to know if the pilot can start in March.
          </p>
        </div>
        <p className={`mt-3 inline-flex rounded-full bg-white/80 px-3 py-1 font-mono text-[11px] text-ink-700 ${fade(2)}`}>↳ cited · message [1]</p>
        <div className="ml-9 w-0.5 rounded-full bg-gradient-to-b from-[#7B5CFF] to-[#FF8A65] transition-[height] duration-500 ease-brand" style={{ height: at(3) ? 26 : 0 }} />
        <div className={`rounded-2xl bg-ink p-5 text-white ${fade(3)}`}>
          <p className="text-xs font-semibold uppercase tracking-wider"><span className="cp-aurora-text">Suggested commitment</span></p>
          <p className="mt-2 text-[17px] font-semibold">Send revised deck to Priya · Friday</p>
          <div className="mt-4 flex items-center gap-2">
            <span className={`rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink transition duration-200 ease-brand ${at(4) ? "scale-95 ring-4 ring-[#7B5CFF]/40" : ""}`}>Approve</span>
            <span className="rounded-full border border-white/25 px-4 py-2 text-sm">Edit</span>
            <span
              key={at(4) ? "approved" : "proposed"}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${at(4) ? "cp-pop bg-success text-white" : "bg-white/10 text-white/80"}`}
            >
              {at(4) && (
                <svg viewBox="0 0 16 16" width="12" height="12" className="cp-check">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {at(4) ? "Approved" : "Proposed"}
            </span>
          </div>
        </div>
        <div className={`mt-4 rounded-2xl border border-dashed border-ink-300 bg-white/60 p-5 ${fade(5)}`}>
          <p className="flex justify-between text-xs font-medium text-ink-500">
            <span>Draft · in your voice</span>
            <span>Not sent</span>
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-700">
            Hi Priya, great talking today. You&apos;ll have the revised deck by Friday, and March works on our side.
          </p>
        </div>
      </div>
      <div>
        <ol className="space-y-2">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className={`grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-3 rounded-2xl px-4 py-3.5 transition duration-300 ease-brand ${
                step === i + 1 ? "cp-glass text-ink" : at(i + 1) ? "text-ink" : "text-ink-500"
              }`}
            >
              <span
                className={`grid h-8 w-8 place-items-center rounded-xl font-mono text-xs transition-colors duration-300 ${
                  at(i + 1) ? "bg-gradient-to-br from-[#C9B6FF] to-[#FFC6A8] text-ink" : "bg-ink-100 text-ink-500"
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
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
          className="mt-5 inline-flex h-11 items-center rounded-full border border-ink-200 bg-white/80 px-5 text-sm font-medium text-ink transition hover:bg-white"
        >
          {playing ? "Pause animation" : "Play animation"}
        </button>
      </div>
    </div>
  );
}
