import { getRequestContext } from "@/lib/auth/context";
import { isOperator } from "@/lib/services/operator";

import { NavItem } from "./nav-links";

/** Shows the Operator link only to platform operators (the console re-checks on every request). */
export async function OperatorNavLink() {
  const ctx = await getRequestContext();
  if (ctx.status !== "authenticated" || !(await isOperator())) return null;
  return <NavItem href="/app/operator" label="Operator" />;
}
