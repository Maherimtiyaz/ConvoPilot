import type { Metadata } from "next";
import { Suspense } from "react";

import { Logo } from "@/components/ui";

import { NavLinks } from "./nav-links";
import { OperatorNavLink } from "./operator-nav-link";

export const metadata: Metadata = { title: { default: "ConvoPilot", template: "%s · ConvoPilot" }, robots: { index: false } };

/**
 * The app shell is static except the Operator link, which reads the session inside Suspense.
 * Every page still checks the signed-in user itself through `ProtectedPage`, because layouts are
 * not re-rendered on every navigation (and the console re-checks operator rights in the database).
 */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-paper md:flex-row">
      <aside className="border-b border-ink-200 bg-white p-4 md:w-64 md:border-b-0 md:border-r">
        <div className="mb-4 md:mb-8">
          <Logo className="h-6 w-auto" />
        </div>
        <NavLinks
          extra={
            <Suspense fallback={null}>
              <OperatorNavLink />
            </Suspense>
          }
        />
      </aside>
      <main className="flex-1 p-6 md:p-10">{children}</main>
    </div>
  );
}
