import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Roofix - Roofing & Gutters",
  description:
    "Gallery of our roofing and gutter projects across Sydney. Roofing, gutters and repairs – see our work.",
  keywords: ["roofing projects Sydney", "gutter projects", "Roofix portfolio"],
  openGraph: {
    title: "Our Projects | Roofix - Roofing & Gutters Sydney",
    description: "Gallery of our roofing and gutter work across Sydney. Licensed, insured.",
    url: "https://roofix.com.au/projects",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "https://roofix.com.au/projects" },
};

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
