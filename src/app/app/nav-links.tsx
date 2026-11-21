"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

export const APP_NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/studio", label: "Communication Studio" },
  { href: "/app/contacts", label: "Contacts" },
  { href: "/app/conversations", label: "Conversations" },
  { href: "/app/tasks", label: "Tasks" },
  { href: "/app/settings", label: "Settings" },
] as const;

const linkClass = (active: boolean) =>
  `relative flex items-center gap-2.5 whitespace-nowrap rounded-xl px-3 py-2 text-sm md:py-2.5 font-medium transition duration-200 ease-brand ${
    active
      ? "bg-white font-semibold text-ink shadow-[0_0_0_1px_rgba(40,30,90,0.06),0_8px_20px_-12px_rgba(40,30,90,0.35)] before:absolute before:left-1 before:top-1/2 before:h-4 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-gradient-to-b before:from-[#7B5CFF] before:to-[#FF8A65]"
      : "text-ink-700 hover:bg-white/60 hover:text-ink"
  }`;

/** "Communication Studio" is long for a phone menu: show "Studio" below the md breakpoint. */
function Label({ label }: { label: string }) {
  if (label !== "Communication Studio") return <>{label}</>;
  return (
    <>
      <span className="md:hidden">Studio</span>
      <span className="hidden md:inline">{label}</span>
    </>
  );
}

/**
 * The path is unknown while prerendering routes with request-time params (e.g. /app/contacts/[id]),
 * so the highlighted state sits behind Suspense; the fallback is the same link, un-highlighted.
 */
export function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Suspense
      fallback={
        <Link href={href} className={linkClass(false)}>
          <Label label={label} />
        </Link>
      }
    >
      <ActiveNavItem href={href} label={label} />
    </Suspense>
  );
}

function ActiveNavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
      <Label label={label} />
    </Link>
  );
}

/** Main navigation. `extra` holds items that depend on the signed-in user (e.g. Operator). */
export function NavLinks({ extra }: { extra?: ReactNode }) {
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-x-0.5 gap-y-1 md:flex-col md:flex-nowrap md:gap-1">
      {APP_NAV.map((item) => (
        <NavItem key={item.href} href={item.href} label={item.label} />
      ))}
      {extra}
    </nav>
  );
}
