import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

const SUMMARY_CARDS = [
  { title: "Pending replies", value: "0", description: "Conversations awaiting your response" },
  { title: "Open tasks", value: "0", description: "Follow-ups and commitments" },
  { title: "Overdue", value: "0", description: "Items past their due date" },
  { title: "Recent conversations", value: "0", description: "Imported in the last 7 days" },
] as const;

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Your day at a glance. Counts will populate as you import conversations and create tasks.
        </p>
      </header>

      <section aria-label="Summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SUMMARY_CARDS.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <CardDescription>{card.title}</CardDescription>
              <CardTitle className="text-2xl">{card.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-zinc-500">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section aria-label="Daily briefing">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Daily briefing</h2>
        <EmptyState
          title="No briefing yet"
          description="The daily briefing is generated from your stored conversations, tasks, and commitments. Import a conversation in the Communication Studio to get started."
        />
      </section>
    </div>
  );
}
