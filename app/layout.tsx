import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Things",
  description: "A digital multiplayer party game — like The Game of Things",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
