import type { Metadata } from "next";
import "./globals.css";

const SITE_DESCRIPTION =
  "Run one prompt through ChatGPT, Claude, Gemini, and Grok at once. Compare answers side by side, then merge them into one synthesized answer. Bring your own API keys — no markup, no training on your data.";

const DEFAULT_TITLE =
  "LettiB — Compare AI Models Side by Side with Your Own API Keys";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.lettib.com"),
  title: {
    default: DEFAULT_TITLE,
    template: "%s | LettiB",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "compare AI models",
    "multi-AI workspace",
    "BYOK AI tool",
    "ChatGPT vs Claude vs Gemini",
    "AI model comparison",
    "bring your own API key",
    "AI answer synthesis",
  ],
  openGraph: {
    type: "website",
    siteName: "LettiB",
    url: "https://www.lettib.com",
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "LettiB — Compare AI models side by side",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://www.lettib.com",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body>
        {children}
      </body>
    </html>
  );
}
