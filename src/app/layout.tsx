import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConvoPilot — Your AI Chief of Staff",
  description:
    "Turns conversations into decisions, commitments, and completed work. Human-in-the-loop AI for professional communication.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
