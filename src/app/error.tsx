"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app_error]", error.message, error.digest);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <h2 className="text-lg font-semibold text-zinc-900">Something went wrong</h2>
      <p className="text-sm text-zinc-500">The error has been logged. No message content is included in logs.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
