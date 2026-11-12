import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/validation/env";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { SetupNotice } from "@/components/layout/setup-notice";
import { Button } from "@/components/ui/button";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const env = getServerEnv();

  return (
    <div className="flex min-h-screen bg-zinc-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight text-zinc-900">
            ConvoPilot
          </Link>
          <p className="text-xs text-zinc-500">AI Chief of Staff</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <SidebarNav />
        </div>
        <div className="border-t border-zinc-200 p-4">
          <p className="truncate text-sm font-medium text-zinc-900">{user.email}</p>
          <form action="/api/auth/signout" method="post">
            <Button variant="ghost" size="sm" className="mt-2 px-0">
              Sign out
            </Button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-8">{env ? children : <SetupNotice />}</main>
    </div>
  );
}
