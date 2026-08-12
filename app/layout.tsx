import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "Risk Theory Lab",
    template: "%s · Risk Theory Lab",
  },
  description:
    "A bilingual actuarial laboratory linking each portfolio visualization to its course formula, assumptions, and contributors.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "Risk Theory Lab",
    description: "Portfolio data connected directly to five risk-theory chapters, formulas, assumptions, and contributors.",
    type: "website",
    images: [{ url: "/og-bilingual-v2.png", width: 1734, height: 907, alt: "Risk Theory Lab — bilingual portfolio and course-model laboratory" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Risk Theory Lab",
    description: "A bilingual portfolio and course-model laboratory.",
    images: ["/og-bilingual-v2.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fa" dir="rtl">
      <head>
        <link rel="preload" href="/fonts/NotoSans-Variable.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  );
}
