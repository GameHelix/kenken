import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KenKen — arithmetic Latin-square puzzle",
  description:
    "A neon KenKen (Calcudoku) puzzle built with Next.js and TypeScript. Fill the grid so every row and column holds 1..N once, and each cage's cells hit its arithmetic target. Every board has exactly one solution and never needs a guess.",
};

export const viewport: Viewport = {
  themeColor: "#070610",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
