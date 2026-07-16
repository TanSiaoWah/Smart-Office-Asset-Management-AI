import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Pantry AI",
  description: "AI-powered pantry management system for tracking food items, expiration dates, and recipe suggestions",
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