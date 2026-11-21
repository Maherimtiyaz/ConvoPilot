"use client";

import { useState } from "react";

/**
 * "Your promises, kept in view": suggested commitments (sample content) with the current one
 * glowing in the middle. Previous/next buttons move through them; nothing moves by itself.
 */
const ITEMS = [
  { from: "Priya Shah", initials: "PS", title: "Send Priya the revised deck", quote: "Could you send the revised deck by Friday?", when: "Friday · pilot deck" },
  { from: "Marco Reyes", initials: "MR", title: "Send the calendar invite", quote: "Tuesday at 10 works for the intro call.", when: "Tuesday 10am · intro call" },
  { from: "Lena Fischer", initials: "LF", title: "Share logo and description", quote: "Can you share your logo and a short description?", when: "By April 15 · co-marketing" },
  { from: "Arjun Mehta", initials: "AM", title: "Send the Q3 numbers", quote: "Can you share Q3 numbers before Monday?", when: "Before Monday · investor update" },
] as const;

export function ShowcaseCarousel() {
  const [index, setIndex] = useState(0);
  const at = (offset: number) => ITEMS[(index + offset + ITEMS.length) % ITEMS.length];
  const current = at(0);

  const arrow =
    "absolute top-1/2 z-10 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border border-ink-200 bg-paper text-ink transition duration-200 ease-brand hover:scale-105 hover:border-ink-300 active:scale-95";

  return (
    <div className="relative mx-auto mt-14 max-w-5xl">
      <div className="grid items-center gap-5 md:grid-cols-3">
        <SideCard item={at(-1)} />
        {/* key restarts the entrance animation when the card changes */}
        <article key={current.title} className="cp-pop relative rounded-[28px] border border-[rgba(123,92,255,0.3)] bg-[linear-gradient(180deg,rgba(123,92,255,0.16),rgba(255,138,101,0.08))] p-7 text-left shadow-[0_30px_90px_-30px_rgba(123,92,255,0.55)] backdrop-blur">
          <span aria-hidden="true" className="cp-glow absolute inset-x-[10%] -bottom-10 h-20 rounded-full bg-[radial-gradient(circle,rgba(192,100,232,0.45),transparent_70%)] blur-xl" />
          <p className="flex items-center gap-2.5 font-mono text-[11px] text-ink-700">
            <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-gradient-to-br from-[#C9B6FF] to-[#FFC6A8] font-sans text-xs font-semibold text-[#17151F]">{current.initials}</span>
            FROM · {current.from}
          </p>
          <h3 className="mt-4 text-[22px] font-semibold leading-snug">{current.title}</h3>
          <p className="mt-1.5 text-sm text-ink-700">“{current.quote}”</p>
          <p className="mt-6 flex flex-wrap gap-2 text-[13px]" aria-hidden="true">
            <span className="rounded-full bg-ink px-4 py-2 font-semibold text-white">Approve</span>
            <span className="rounded-full border border-ink-300 px-4 py-2">Not now</span>
            <span className="rounded-full border border-ink-300 px-4 py-2 font-mono text-[11px] leading-5">cited [1]</span>
          </p>
        </article>
        <SideCard item={at(1)} />
      </div>
      <button type="button" aria-label="Previous example" onClick={() => setIndex((i) => (i - 1 + ITEMS.length) % ITEMS.length)} className={`${arrow} -left-2 md:-left-5`}>
        ‹
      </button>
      <button type="button" aria-label="Next example" onClick={() => setIndex((i) => (i + 1) % ITEMS.length)} className={`${arrow} -right-2 md:-right-5`}>
        ›
      </button>
      <p className="sr-only" aria-live="polite">
        Example {index + 1} of {ITEMS.length}: {current.title}
      </p>
    </div>
  );
}

function SideCard({ item }: { item: (typeof ITEMS)[number] }) {
  return (
    <div className="cp-glass hidden scale-[0.92] rounded-[26px] p-6 text-left opacity-55 transition duration-500 ease-brand md:block" aria-hidden="true">
      <p className="font-mono text-[11px] text-ink-500">FROM · {item.from}</p>
      <p className="mt-3.5 text-[19px] font-semibold">{item.title}</p>
      <p className="mt-1.5 text-sm text-ink-500">{item.when}</p>
      <p className="mt-5 flex gap-2 text-[11px]">
        <span className="rounded-full border border-ink-300 px-2.5 py-1">cited [1]</span>
        <span className="rounded-full border border-ink-300 px-2.5 py-1">proposed</span>
      </p>
    </div>
  );
}
