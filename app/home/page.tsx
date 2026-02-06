import type { Metadata } from "next";
import HomePageContent, {
  BASE_URL,
  getLocalBusinessJsonLd,
} from "../HomePageContent";

const HOME_URL = `${BASE_URL}/home`;

export const metadata: Metadata = {
  title: "Roofix - Roofing & Gutters",
  description:
    "Roofix – roofing and gutters across Sydney. New roof, re-roof, roof restoration, gutters, repairs and inspections. Licensed & insured. Written warranty. Free quotes. We've got you covered.",
  keywords: [
    "roofing Sydney",
    "gutters Sydney",
    "roof repair Sydney",
    "new roof Sydney",
    "roof replacement Sydney",
    "gutter installation Sydney",
  ],
  openGraph: {
    title: "Roofix - Roofing & Gutters Sydney | We've got you covered.",
    description:
      "Licensed, insured roofing and gutters across Sydney. New roof, re-roof, roof restoration, gutters, repairs and inspections. Free quotes.",
    url: HOME_URL,
    type: "website",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "Roofix - Roofing & Gutters Sydney",
    description:
      "Licensed, insured roofing and gutters. Free quotes. We've got you covered.",
  },
  alternates: { canonical: HOME_URL },
};

export const revalidate = 300;

export default async function HomeSlugPage() {
  const jsonLd = getLocalBusinessJsonLd(HOME_URL);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePageContent />
    </>
  );
}
