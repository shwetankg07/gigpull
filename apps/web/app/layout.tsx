import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "gigpull",
  description: "Paid work and startups worth a message, ranked.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
