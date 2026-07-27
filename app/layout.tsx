import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spurs Gift Cards — buy, sell, spend",
  description: "Buy Spurs gift cards, sell your unused Amazon, Steam and iTunes cards for naira, and spend Spurs credit across the platform.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
