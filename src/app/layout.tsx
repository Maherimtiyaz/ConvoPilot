import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Newsreader } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme";

import "./globals.css";

// Brand typefaces (docs/BRAND.md §7), self-hosted by next/font at build time.
const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });
const newsreader = Newsreader({ variable: "--font-newsreader", subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"] });
const plexMono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin"], weight: ["400", "500"] });

/** Absolute base for link previews; read directly (not validated) so builds never depend on it. */
function siteUrl(): URL {
  try {
    // Read at build time. On Vercel, fall back to the project's production domain.
    const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
    return new URL(process.env.NEXT_PUBLIC_APP_URL || vercel || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "ConvoPilot", template: "%s · ConvoPilot" },
  description: "The AI chief of staff for your conversations. Nothing important slips.",
  openGraph: {
    type: "website",
    siteName: "ConvoPilot",
    title: "ConvoPilot — Nothing important slips",
    description: "The AI chief of staff for your conversations. Quotes what matters, drafts replies in your voice, tracks your commitments. Invite-only early access.",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${newsreader.variable} ${plexMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Applies the saved or device theme before the first paint (no flash). Static, no user data. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
