import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/validation/env";

export default async function SettingsPage() {
  const user = await requireUser();
  const env = getServerEnv();

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Account and configuration.</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as {user.email}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI provider</CardTitle>
          <CardDescription>
            Configured server-side via environment variables. Never exposed to the browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Badge tone={env ? "success" : "danger"}>{env ? env.AI_PROVIDER : "not configured"}</Badge>
          {env ? <span className="text-sm text-zinc-500">model: {env.AI_MODEL}</span> : null}
        </CardContent>
      </Card>
    </div>
  );
}
