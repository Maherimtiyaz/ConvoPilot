import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <h2 className="text-lg font-semibold text-zinc-900">Page not found</h2>
      <Link href="/dashboard" className="text-sm font-medium text-zinc-900 underline">
        Back to dashboard
      </Link>
    </div>
  );
}
