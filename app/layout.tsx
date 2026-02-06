import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFBC00",
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = "https://roofix.com.au";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  alternates: {
    canonical: "/",
  },
  title: "Roofix - Roofing & Gutters",
  description:
    "We've got you covered. Roofing and gutters across Sydney. New roof, re-roof, roof restoration, gutters, repairs and inspections. Licensed, insured. Written warranty. Free quotes.",
  keywords: [
    "roofing Sydney",
    "gutters Sydney",
    "roof repair Sydney",
    "roof replacement Sydney",
    "gutter installation Sydney",
    "Roofix",
  ],
  openGraph: {
    type: "website",
    locale: "en_AU",
    siteName: "Roofix - Roofing & Gutters",
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: `${BASE_URL}/favicon.ico`, type: "image/x-icon", sizes: "any" },
      { url: `${BASE_URL}/favicon-16x16.png`, type: "image/png", sizes: "16x16" },
      { url: `${BASE_URL}/favicon-32x32.png`, type: "image/png", sizes: "32x32" },
    ],
    shortcut: `${BASE_URL}/favicon.ico`,
    apple: `${BASE_URL}/apple-touch-icon.png`,
  },
  manifest: "/site.webmanifest",
};

import { headers } from "next/headers";
import LayoutSwitcher from "@/components/LayoutSwitcher";
import GA4Script from "@/components/GA4Script";

const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const isControlCentre = headersList.get("x-is-control-centre") === "1";

  return (
    <html lang="en-AU">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}
      >
        {!isControlCentre && GA4_ID && <GA4Script gaId={GA4_ID} />}
        <LayoutSwitcher isControlCentre={isControlCentre}>{children}</LayoutSwitcher>
      </body>
    </html>
  );
}
