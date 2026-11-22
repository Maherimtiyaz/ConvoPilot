"use client";

/**
 * Last-resort error page when the root layout itself fails. It replaces the whole document, so it
 * cannot use the app's stylesheet: plain inline styles only. No error details are shown (in
 * production the message is generic anyway; the digest matches the server log).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#FBFAFE", color: "#17151F", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
        <title>Something went wrong · ConvoPilot</title>
        <main role="alert" style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: "0 0 12px" }}>Something went wrong</h1>
          <p style={{ color: "#3B3851", lineHeight: 1.6, margin: "0 0 24px" }}>Please try again. Your data is safe; nothing was sent anywhere.</p>
          <button type="button" onClick={() => retry()} style={{ background: "#17151F", color: "#fff", border: 0, borderRadius: 999, padding: "12px 24px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
          {digest && <p style={{ marginTop: 20, fontSize: 12, color: "#635F7C", fontFamily: "ui-monospace, monospace" }}>Reference: {digest}</p>}
        </main>
      </body>
    </html>
  );
}
