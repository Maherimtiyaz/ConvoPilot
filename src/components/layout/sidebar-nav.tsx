"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/studio", label: "Communication Studio" },
  { href: "/contacts", label: "Contacts" },
  { href: "/conversations", label: "Conversations" },
  { href: "/tasks", label: "Tasks" },
  { href: "/settings", label: "Settings" },
] as const;

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
