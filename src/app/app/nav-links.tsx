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
  `whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
    active ? "bg-ink-100 font-semibold text-ink shadow-[inset_3px_0_0_var(--color-ink)]" : "text-ink-700 hover:bg-ink-100 hover:text-ink"
  }`;

/**
 * The path is unknown while prerendering routes with request-time params (e.g. /app/contacts/[id]),
 * so the highlighted state sits behind Suspense; the fallback is the same link, un-highlighted.
 */
export function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Suspense
      fallback={
        <Link href={href} className={linkClass(false)}>
          {label}
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
      {label}
    </Link>
  );
}

/** Main navigation. `extra` holds items that depend on the signed-in user (e.g. Operator). */
export function NavLinks({ extra }: { extra?: ReactNode }) {
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1 md:flex-col md:flex-nowrap">
      {APP_NAV.map((item) => (
        <NavItem key={item.href} href={item.href} label={item.label} />
      ))}
      {extra}
    </nav>
  );
}
