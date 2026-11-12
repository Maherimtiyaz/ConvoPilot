import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-16 text-center",
        className,
      )}
    >
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      <p className="max-w-md text-sm text-zinc-500">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
