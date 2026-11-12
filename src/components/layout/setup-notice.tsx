import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SetupNotice() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Supabase is not configured yet</CardTitle>
        <CardDescription>
          ConvoPilot needs a Supabase project for authentication and the database.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-600">
          <li>Create a project at supabase.com (or run the Supabase CLI locally).</li>
          <li>
            Apply the schema: <code className="rounded bg-zinc-100 px-1">supabase/migrations/0001_initial_schema.sql</code>
          </li>
          <li>
            Copy <code className="rounded bg-zinc-100 px-1">.env.example</code> to{" "}
            <code className="rounded bg-zinc-100 px-1">.env.local</code> and fill in the project URL and anon key.
          </li>
          <li>Restart the dev server.</li>
        </ol>
      </CardContent>
    </Card>
  );
}
