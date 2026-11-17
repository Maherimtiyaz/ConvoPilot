"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const APP_NAV = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/studio", label: "Communication Studio" },
  { href: "/app/contacts", label: "Contacts" },
  { href: "/app/conversations", label: "Conversations" },
  { href: "/app/tasks", label: "Tasks" },
  { href: "/app/settings", label: "Settings" },
] as const;

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col">
      {APP_NAV.map((item) => {
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
