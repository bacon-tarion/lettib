import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LettiB",
  description: "Multi-AI workspace for AI power users",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
