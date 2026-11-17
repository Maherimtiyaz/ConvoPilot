"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export const APP_NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/studio", label: "Communication Studio" },
  { href: "/app/contacts", label: "Contacts" },
  { href: "/app/conversations", label: "Conversations" },
  { href: "/app/tasks", label: "Tasks" },
  { href: "/app/settings", label: "Settings" },
] as const;

export function NavItem({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = href === "/app" ? pathname === "/app" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium ${
        active ? "bg-ink-100 font-semibold text-ink shadow-[inset_3px_0_0_var(--color-ink)]" : "text-ink-700 hover:bg-ink-100 hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
}

/** Main navigation. `extra` holds items that depend on the signed-in user (e.g. Operator). */
export function NavLinks({ extra }: { extra?: ReactNode }) {
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col">
      {APP_NAV.map((item) => (
        <NavItem key={item.href} href={item.href} label={item.label} />
      ))}
      {extra}
    </nav>
  );
}
