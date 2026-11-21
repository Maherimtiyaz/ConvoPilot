import type { Metadata } from "next";
import { Suspense } from "react";

import { AuroraBackground, Logo } from "@/components/ui";

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
    <div className="relative flex min-h-full flex-1 flex-col md:flex-row">
      <AuroraBackground quiet />
      <aside className="p-3 md:sticky md:top-0 md:h-screen md:w-72 md:p-4">
        <div className="cp-glass flex h-full flex-col rounded-3xl p-3 md:p-4">
          <div className="mb-2 px-2 pt-1 md:mb-8">
            <Logo className="h-6 w-auto" />
          </div>
          <NavLinks
            extra={
              <Suspense fallback={null}>
                <OperatorNavLink />
              </Suspense>
            }
          />
          <p className="mt-auto hidden items-center gap-2 px-2 pt-6 text-xs text-ink-500 md:flex">
            <span className="cp-chisel" aria-hidden="true" />
            Nothing is sent for you
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 pb-10 pt-4 md:px-8 md:pt-8">{children}</main>
    </div>
  );
}
