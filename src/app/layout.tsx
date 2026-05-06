import type { Metadata } from "next";
import { Cormorant_Garamond, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const displayFont = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const bodyFont = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://civfolio-863153693968.us-central1.run.app"),
  applicationName: "Project Empire",
  title: {
    default: "Project Empire",
    template: "%s | Project Empire",
  },
  description: "Phil Lopez's work mapped as a living strategy empire of AI systems, game projects, public writing, and open-source tools.",
  keywords: [
    "Project Empire",
    "Phil Lopez",
    "portfolio",
    "AI projects",
    "strategy map",
    "game development",
    "software engineering",
    "Robot Future",
  ],
  authors: [{ name: "Phil Lopez" }],
  creator: "Phil Lopez",
  publisher: "Robot Future",
  category: "portfolio",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: [
      { url: "/brand/project-empire-icon.svg", type: "image/svg+xml" },
      { url: "/brand/project-empire-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/project-empire-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/project-empire-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/project-empire-icon-512.png", sizes: "512x512", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Project Empire",
    title: "Project Empire",
    description: "Explore Phil Lopez's work as a living strategy-map portfolio.",
    images: [
      {
        url: "/brand/project-empire-og.png",
        width: 1200,
        height: 630,
        alt: "Project Empire, a living strategy-map portfolio by Phil Lopez.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Project Empire",
    description: "Explore Phil Lopez's work as a living strategy-map portfolio.",
    images: ["/brand/project-empire-og.png"],
  },
  formatDetection: {
    telephone: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} h-full antialiased`}
      data-scroll-behavior="smooth"
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
