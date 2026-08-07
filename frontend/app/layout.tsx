import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Offices Asset Management AI",
  description: "AI-powered asset management system for tracking office items, inventory levels, and maintenance schedules",
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