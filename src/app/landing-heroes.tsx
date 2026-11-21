import type { ReactNode } from "react";

/*
 * The two landing heroes (docs/BRAND.md §18). Both are in the page; CSS shows "Orbit" in light
 * mode and "Signal" in dark mode, so switching theme never reloads anything. The hidden one is
 * `display: none`, which also hides it from screen readers. All product content is sample content.
 */

const MARK_PATH = "M15.84 0H72L56.16 44H0Z";
const QUOTES_PATH = "M20.97 16.07A6.8 6.8 0 1 1 31.49 23.16L17.06 33.22ZM41.51 16.07A6.8 6.8 0 1 1 52.03 23.16L37.6 33.22Z";

/** The ConvoPilot symbol with the Aurora gradient. `id` must be unique on the page. */
export function Mark({ id, className, dotted = false, cutout = "var(--color-ink)" }: { id: string; className?: string; dotted?: boolean; cutout?: string }) {
  return (
    <svg viewBox="0 0 72 44" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#B9A2FF" />
          <stop offset=".55" stopColor="#E6A6E8" />
          <stop offset="1" stopColor="#FFB892" />
        </linearGradient>
        {dotted && (
          <pattern id={`${id}-dots`} width="2.2" height="2.2" patternUnits="userSpaceOnUse">
            <circle cx="1.1" cy="1.1" r="0.75" fill={`url(#${id}-g)`} />
          </pattern>
        )}
      </defs>
      <path fill={dotted ? `url(#${id}-dots)` : `url(#${id}-g)`} d={MARK_PATH} />
      <path fill={cutout} d={QUOTES_PATH} />
    </svg>
  );
}

/** Text running around a slowly turning circle, with the mark in the middle. */
export function RotatingBadge({ id, className = "" }: { id: string; className?: string }) {
  return (
    <div className={`h-[120px] w-[120px] ${className.includes("absolute") ? "" : "relative"} ${className}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" className="cp-spin h-full w-full">
        <defs>
          <path id={`${id}-circle`} d="M60,60 m-46,0 a46,46 0 1,1 92,0 a46,46 0 1,1 -92,0" />
        </defs>
        <text className="fill-ink-700 font-mono text-[9.5px] tracking-[3px]">
          <textPath href={`#${id}-circle`}>NOTHING IMPORTANT SLIPS · IN YOUR VOICE · </textPath>
        </text>
      </svg>
      <Mark id={`${id}-mark`} className="absolute left-1/2 top-1/2 h-6 w-10 -translate-x-1/2 -translate-y-1/2" />
    </div>
  );
}

const pillButton =
  "group inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15px] font-semibold transition duration-200 ease-brand hover:-translate-y-0.5";

function Chip({ dot, children, className }: { dot: string; children: ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3.5 py-2 text-[13px] font-medium shadow-[0_10px_24px_-14px_rgba(40,30,90,0.4)] ${className}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {children}
    </span>
  );
}

/** Light mode — "Orbit": a thread card at the centre of a turning orbit, floating cards around it. */
export function HeroOrbit() {
  return (
    <section className="relative overflow-hidden pb-10 pt-14 text-center dark:hidden sm:pt-20">
      <div aria-hidden="true" className="absolute -left-[10%] -top-[10%] h-[60%] w-[55%] rounded-full bg-[radial-gradient(closest-side,#D9CCFF,transparent)] blur-2xl" />
      <div aria-hidden="true" className="absolute -right-[8%] top-0 h-[55%] w-[45%] rounded-full bg-[radial-gradient(closest-side,#FFD7C2,transparent)] blur-2xl" />
      <RotatingBadge id="orbit-badge" className="absolute right-[6%] top-24 hidden xl:block" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <p className="cp-rise inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white/70 px-4 py-2 text-sm text-ink-700 backdrop-blur">
          <span className="relative flex h-2 w-2" aria-hidden="true">
            <span className="cp-ring absolute inline-flex h-full w-full rounded-full bg-[#7B5CFF]" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#7B5CFF]" />
          </span>
          Invite-only early access · inviting founders in small groups
        </p>
        <h1 className="cp-rise cp-d1 mt-8">
          <span className="block font-display text-[clamp(3rem,8.5vw,5.75rem)] font-semibold leading-[0.98] tracking-[-0.045em]">Nothing important</span>{" "}
          <span className="block font-serif text-[clamp(3.2rem,9vw,6.25rem)] italic leading-[1.02] tracking-[-0.03em]">
            <span className="cp-aurora-text">slips.</span>
          </span>
        </h1>
        <p className="cp-rise cp-d2 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-ink-500">
          ConvoPilot reads the thread, drafts the reply in your own voice and keeps every promise in view. Nothing happens without your approval.
        </p>
        <div className="cp-rise cp-d3 mt-8 flex flex-wrap justify-center gap-3">
          <a href="#waitlist" className={`${pillButton} bg-ink text-white shadow-[0_14px_30px_-12px_rgba(23,21,31,0.6)]`}>
            Request early access <span className="cp-arrow" aria-hidden="true">→</span>
          </a>
          <a href="#how-it-works" className={`${pillButton} border border-ink-200 bg-white font-medium text-ink`}>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-ink text-[9px] text-white" aria-hidden="true">▶</span>
            See how it works
          </a>
        </div>
      </div>

      {/* The orbit stage (sample content). Side cards and chips are placed around it on wide screens. */}
      <div className="cp-rise cp-d4 relative mx-auto mt-12 max-w-[1240px] px-4 lg:h-[540px]" aria-hidden="true">
        <svg viewBox="0 0 1240 540" preserveAspectRatio="none" className="absolute inset-0 hidden h-full w-full lg:block">
          <ellipse cx="620" cy="320" rx="430" ry="170" fill="none" stroke="var(--color-ink-300)" strokeDasharray="4 8" className="cp-dash" />
          <path d="M230 170 C 290 320, 400 350, 470 320" fill="none" stroke="#CFC8E6" strokeWidth="1.2" />
          <path d="M1010 200 C 950 320, 860 350, 770 320" fill="none" stroke="#CFC8E6" strokeWidth="1.2" />
          <circle cx="470" cy="320" r="4" fill="#7B5CFF" />
          <circle cx="770" cy="320" r="4" fill="#FF8A65" />
        </svg>
        <div className="cp-glow absolute left-1/2 top-1/2 h-[300px] w-[min(520px,90vw)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(201,182,255,0.55),transparent)] blur-xl" />

        {/* Centre: the thread with a cited ask and a suggested commitment */}
        <div className="cp-float relative mx-auto w-full max-w-[420px] rounded-[28px] border border-white/90 bg-white/85 p-6 text-left shadow-[0_0_0_1px_rgba(40,30,90,0.05),0_40px_70px_-40px_rgba(40,30,90,0.45)] backdrop-blur lg:absolute lg:left-1/2 lg:top-[140px] lg:-ml-[210px]">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#C9B6FF] to-[#FFC6A8] text-[13px] font-semibold text-[#17151F]">PS</span>
            <span>
              <span className="block text-sm font-semibold">Priya Shah</span>
              <span className="block text-xs text-ink-500">Thu 09:14 · sample</span>
            </span>
          </div>
          <p className="mt-3.5 text-[15px] leading-relaxed text-ink-700">
            Thanks for the call today. Could you <span className="cp-highlight cp-highlight-sweep text-ink">send the revised deck by Friday</span>?
          </p>
          <div className="mt-3.5 flex items-center justify-between gap-3 rounded-2xl bg-ink px-3.5 py-3 text-[13px] text-white">
            <span>
              <span className="block text-[10px] tracking-[0.08em] text-[#C9B6FF]">SUGGESTED COMMITMENT</span>
              Send the deck · Friday
            </span>
            <span className="rounded-full bg-white px-3.5 py-1.5 font-semibold text-ink">Approve</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3 lg:contents">
          <Chip dot="#7B5CFF" className="cp-float lg:absolute lg:left-[210px] lg:top-[370px]">Cited · message 1</Chip>
          <Chip dot="#FF8A65" className="cp-float cp-d2 lg:absolute lg:left-[900px] lg:top-[390px]">Draft in your voice</Chip>
          <Chip dot="#7ED9B0" className="cp-float cp-d1 lg:absolute lg:left-[540px] lg:top-[478px]">Added to your tasks</Chip>
        </div>

        <div className="cp-tilt-l absolute left-[6%] top-[30px] hidden w-[220px] rounded-3xl bg-white/90 p-5 text-left shadow-[0_0_0_1px_rgba(40,30,90,0.05),0_30px_50px_-30px_rgba(40,30,90,0.4)] lg:block">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-[10px] bg-ink-100 font-mono text-xs">[1]</span>
          <p className="mt-3.5 text-[17px] font-semibold leading-tight">Turn threads into follow-through.</p>
          <p className="mt-1.5 text-[13px] text-ink-500">Understand, reply, keep your word.</p>
        </div>
        <div className="cp-tilt-r absolute right-[6%] top-[60px] hidden w-[220px] rounded-3xl bg-white/90 p-5 text-left shadow-[0_0_0_1px_rgba(40,30,90,0.05),0_30px_50px_-30px_rgba(40,30,90,0.4)] lg:block">
          <div className="flex">
            {[
              ["AQ", "#E2D6FF"],
              ["MR", "#FFDCC9"],
              ["LF", "#D6ECFF"],
            ].map(([initials, color], i) => (
              <span key={initials} className={`grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-white text-[11px] font-semibold ${i ? "-ml-2" : ""}`} style={{ background: color }}>
                {initials}
              </span>
            ))}
          </div>
          <p className="mt-3.5 text-[17px] font-semibold leading-tight">Nothing is ever sent for you.</p>
          <p className="mt-1.5 text-[13px] text-ink-500">You approve every word.</p>
        </div>
      </div>

      <div className="relative mx-auto mt-10 flex max-w-[1240px] flex-wrap items-end justify-between gap-6 px-6 text-left text-[15px] text-ink-700 sm:px-10">
        <p>
          <span className="mb-3 block h-px w-7 bg-ink-300" aria-hidden="true" />
          Inviting founders
          <br />
          in small groups.
        </p>
        <p className="text-right">
          <span className="text-[#7B5CFF]" aria-hidden="true">✦</span>
          <br />
          Less chasing.
          <br />
          More closing.
        </p>
      </div>
    </section>
  );
}

const STEP_ICONS: { label: string; path: ReactNode }[] = [
  { label: "Understand", path: <path d="M4 5h16v11H8l-4 4z" /> },
  { label: "Cite", path: <path d="M9 7H5v10h4M15 7h4v10h-4" /> },
  { label: "Propose", path: <path d="M5 12h14M13 6l6 6-6 6" /> },
  {
    label: "Approve",
    path: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M8.5 12.5l2.5 2.5 4.5-5" />
      </>
    ),
  },
  { label: "Reply", path: <path d="M4 12l16-7-6 16-3-6z" /> },
];

/** Dark mode — "Signal": a beam of light, the mark drawn in glowing dots, an ask becoming a promise. */
export function HeroSignal() {
  return (
    <section className="relative hidden overflow-hidden bg-[radial-gradient(80%_60%_at_50%_40%,#151226_0%,transparent_70%)] pb-12 pt-16 text-center dark:block sm:pt-24">
      <div aria-hidden="true" className="cp-beam absolute -top-[30%] left-[30%] h-[160%] w-[280px] bg-[linear-gradient(180deg,rgba(201,182,255,0)_0%,rgba(201,182,255,0.35)_40%,rgba(255,198,168,0.25)_70%,rgba(255,198,168,0)_100%)] blur-[40px]" />
      <span aria-hidden="true" className="cp-twinkle absolute left-[18%] top-[22%] text-[#CFC8E6]">✦</span>
      <span aria-hidden="true" className="cp-twinkle cp-d3 absolute right-[22%] top-[30%] text-xs text-[#FFC6A8]">✦</span>

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        <p className="cp-rise inline-flex items-center gap-2 rounded-full border border-ink-200 px-4 py-2 font-mono text-xs text-ink-700">
          <span className="cp-twinkle h-1.5 w-1.5 rounded-full bg-[#C9B6FF]" aria-hidden="true" />
          Invite-only early access
        </p>
        <h1 className="cp-rise cp-d1 mt-8 text-[clamp(2.8rem,7.5vw,4.75rem)] font-light leading-[1.05] tracking-[-0.03em]">
          Every conversation,
          <br />
          <span className="font-serif italic">followed through.</span>
        </h1>
        <p className="cp-rise cp-d2 mx-auto mt-6 max-w-[520px] font-mono text-sm leading-[1.7] text-ink-500">
          what they asked, and what you promised, held in one quiet place until it&apos;s done
        </p>
        <a href="#waitlist" className={`cp-rise cp-d3 mt-8 ${pillButton} bg-ink text-white`}>
          Request early access <span className="cp-arrow" aria-hidden="true">→</span>
        </a>
      </div>

      {/* Their message → the mark → your commitment (sample content) */}
      <div className="cp-rise cp-d4 relative mx-auto mt-10 max-w-[1240px] px-4 lg:h-[440px]" aria-hidden="true">
        <svg viewBox="0 0 1240 440" preserveAspectRatio="none" className="absolute inset-0 hidden h-full w-full lg:block">
          <path d="M400 220 H 540" fill="none" stroke="#C9B6FF" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" className="cp-flow" />
          <path d="M700 220 H 840" fill="none" stroke="#FFC6A8" strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" className="cp-flow" />
        </svg>
        <div className="relative mx-auto h-[220px] w-[300px] lg:absolute lg:left-1/2 lg:top-[220px] lg:-ml-[150px] lg:-mt-[110px]">
          <div className="cp-glow absolute left-1/2 top-1/2 h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(192,100,232,0.45),rgba(123,92,255,0.15)_40%,transparent_70%)] blur-[10px]" />
          <Mark id="signal-mark" dotted cutout="var(--color-paper)" className="cp-float absolute left-1/2 top-1/2 h-[140px] w-[230px] -translate-x-1/2 -translate-y-1/2" />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:contents">
          <div className="cp-float rounded-[22px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] px-5 py-[18px] text-left lg:absolute lg:left-[100px] lg:top-[160px] lg:w-[300px]">
            <p className="font-mono text-[11px] text-ink-500">THEY ASKED · Priya</p>
            <p className="mt-2 text-base leading-normal text-ink-700">“Could you send the revised deck by Friday?”</p>
          </div>
          <div className="cp-float cp-d2 rounded-[22px] border border-[rgba(255,198,168,0.25)] bg-[rgba(255,255,255,0.07)] px-5 py-[18px] text-left shadow-[0_0_60px_-20px_rgba(255,138,101,0.45)] lg:absolute lg:right-[100px] lg:top-[150px] lg:w-[300px]">
            <p className="font-mono text-[11px] text-[#FFC6A8]">YOU PROMISED · approved ✓</p>
            <p className="mt-2 text-base leading-normal text-ink">Send Priya the revised deck</p>
            <p className="mt-1 text-[13px] text-ink-500">Friday · on your task list</p>
          </div>
        </div>
      </div>

      <ul className="relative mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-x-11 gap-y-6 px-4 text-[13px] text-ink-500">
        {STEP_ICONS.map((s, i) => (
          <li key={s.label} className={`cp-rise cp-d${Math.min(i + 2, 6)} flex flex-col items-center gap-2`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--color-ink-700)" strokeWidth="1.5" aria-hidden="true">
              {s.path}
            </svg>
            {s.label}
          </li>
        ))}
      </ul>
    </section>
  );
}
