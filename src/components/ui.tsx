import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/** Brand logo from public/brand (docs/BRAND.md §5.4, recolored in v2 Aurora). `tone="dark"` for dark backgrounds. */
export function Logo({ tone = "light", className = "h-7 w-auto" }: { tone?: "light" | "dark"; className?: string }) {
  const src = tone === "dark" ? "/brand/logo-horizontal-on-dark.svg" : "/brand/logo-horizontal.svg";
  return (
    <Link href="/" className="inline-flex shrink-0 transition-opacity hover:opacity-80" aria-label="ConvoPilot home">
      {/* Plain <img>: a static SVG needs no optimisation. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="ConvoPilot" width={656} height={107} className={className} />
    </Link>
  );
}

/** Soft, slowly drifting aurora light behind the page (decorative; still when motion is reduced). */
export function AuroraBackground({ quiet = false }: { quiet?: boolean }) {
  return (
    <div className={`cp-aurora ${quiet ? "cp-aurora-quiet" : ""}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

const SIGNUP_STEPS = ["Your email", "Check inbox", "Continue", "You're in"] as const;

/**
 * Where the person is in getting started: the bar fills to the current step when the page
 * appears and finished steps show a tick. `step` is 1–4.
 */
export function SignupSteps({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label="Getting started" className="w-full max-w-md">
      <ol className="relative grid grid-cols-4 text-center text-[11px] font-medium text-ink-500">
        <span aria-hidden="true" className="absolute left-[12.5%] right-[12.5%] top-3 h-0.5 rounded-full bg-ink-200" />
        <span
          aria-hidden="true"
          className="cp-progress-bar absolute left-[12.5%] top-3 h-0.5 rounded-full bg-gradient-to-r from-[#7B5CFF] to-[#FF8A65]"
          style={{ "--to": `calc((100% - 25%) * ${(step - 1) / (SIGNUP_STEPS.length - 1)})` } as CSSProperties}
        />
        {SIGNUP_STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <li key={label} aria-current={current ? "step" : undefined} className="relative flex flex-col items-center gap-1.5">
              <span
                className={`relative z-10 grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold transition-colors ${
                  done ? "bg-ink text-white" : current ? "cp-pop bg-white text-ink ring-2 ring-route" : "bg-white text-ink-500 ring-1 ring-ink-200"
                }`}
              >
                {done ? (
                  <svg viewBox="0 0 16 16" width="12" height="12" className="cp-check" aria-hidden="true">
                    <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  n
                )}
              </span>
              <span className={current ? "text-ink" : ""}>{label}</span>
            </li>
          );
        })}
      </ol>
      <span className="sr-only">Step {step} of 4</span>
    </nav>
  );
}

/** Centered glass card used by the sign-in, invitation and email-link pages. */
export function AuthCard({ title, children, step, art }: { title: string; children: ReactNode; step?: 1 | 2 | 3 | 4; art?: ReactNode }) {
  return (
    <main className="relative flex min-h-full flex-1 flex-col items-center justify-center px-4 py-14">
      <AuroraBackground />
      <div className="cp-rise mb-8">
        <Logo />
      </div>
      {step && (
        <div className="cp-rise cp-d1 mb-6 flex w-full justify-center">
          <SignupSteps step={step} />
        </div>
      )}
      <section className="cp-glass-strong cp-rise cp-d2 w-full max-w-md rounded-3xl p-8 sm:p-9">
        {art && <div className="mb-6 flex justify-center">{art}</div>}
        <h1 className="font-display text-3xl tracking-tight text-ink">{title}</h1>
        <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-700">{children}</div>
      </section>
      <p className="cp-rise cp-d4 mt-8 inline-flex items-center gap-2 rounded-full bg-white/60 px-3 py-1.5 text-xs text-ink-500 backdrop-blur">
        <span className="cp-chisel" aria-hidden="true" />
        Private by design · nothing is ever sent for you
      </p>
    </main>
  );
}

/** "Check your email" illustration: an envelope with a letter rising out of it and a soft pulse. */
export function EnvelopeArt() {
  return (
    <div className="relative h-24 w-28" aria-hidden="true">
      <span className="cp-ring absolute inset-2 rounded-full bg-[radial-gradient(circle,var(--color-aurora-lilac),transparent_70%)]" />
      <svg viewBox="0 0 112 96" className="relative h-full w-full">
        <defs>
          <linearGradient id="cp-env" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#B9A2FF" />
            <stop offset="1" stopColor="#FFB892" />
          </linearGradient>
        </defs>
        <g className="cp-letter">
          <rect x="30" y="20" width="52" height="44" rx="6" fill="#fff" stroke="#E7E4F1" />
          <rect x="38" y="30" width="28" height="4" rx="2" fill="#D5D1E5" />
          <rect x="38" y="39" width="36" height="4" rx="2" fill="#E7E4F1" />
          <rect x="38" y="48" width="22" height="4" rx="2" fill="url(#cp-env)" />
        </g>
        <path d="M18 44 L56 70 L94 44 V84 a6 6 0 0 1 -6 6 H24 a6 6 0 0 1 -6 -6 Z" fill="url(#cp-env)" />
        <path d="M18 84 L48 62 M94 84 L64 62" stroke="#fff" strokeOpacity="0.6" strokeWidth="2" />
      </svg>
    </div>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="cp-toast rounded-xl border border-error/25 bg-error-50 px-3.5 py-2.5 text-sm text-error">
      {message}
    </p>
  );
}

export const inputClass =
  "block h-12 w-full rounded-xl border border-ink-200 bg-white/80 px-4 text-[15px] text-ink shadow-[inset_0_1px_2px_rgba(23,21,31,0.04)] placeholder:text-ink-500 transition duration-200 ease-brand hover:border-ink-300 focus:border-route focus:bg-white focus:outline-none focus:ring-4 focus:ring-route/15";

export const buttonClass =
  "group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(23,21,31,0.55)] transition duration-200 ease-brand hover:-translate-y-px hover:bg-ink-700 hover:shadow-[0_14px_30px_-12px_rgba(91,63,224,0.55)] active:translate-y-0 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex h-12 items-center justify-center rounded-full border border-ink-200 bg-white/80 px-5 text-[15px] font-medium text-ink backdrop-blur transition duration-200 ease-brand hover:-translate-y-px hover:border-ink-300 hover:bg-white active:scale-[0.98]";

/** AI is working: three breathing dots with a label (announced politely to screen readers). */
export function Thinking({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2" aria-live="polite">
      <span className="cp-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {label}
    </span>
  );
}

/** A little burst of light for big moments. Decorative only. */
export function Sparks() {
  const colors = ["#7B5CFF", "#C064E8", "#FF8A65", "#5DB8FF", "#7ED9B0"];
  const parts = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const r = 60 + (i % 3) * 18;
    return { x: `${Math.round(Math.cos(angle) * r)}px`, y: `${Math.round(Math.sin(angle) * r)}px`, c: colors[i % colors.length], d: `${(i % 4) * 40}ms` };
  });
  return (
    <span className="cp-sparks" aria-hidden="true">
      {parts.map((p, i) => (
        <i key={i} style={{ "--x": p.x, "--y": p.y, background: p.c, animationDelay: p.d } as CSSProperties} />
      ))}
    </span>
  );
}
