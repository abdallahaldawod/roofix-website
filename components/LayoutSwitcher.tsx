"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollToTop from "@/components/ScrollToTop";

export default function LayoutSwitcher({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isControlCentre = pathname?.startsWith("/control-centre") ?? false;

  if (isControlCentre) {
    return <>{children}</>;
  }

  return (
    <>
      <ScrollToTop />
      <Header />
      <main className="min-h-screen mb-0">{children}</main>
      <Footer />
    </>
  );
}
