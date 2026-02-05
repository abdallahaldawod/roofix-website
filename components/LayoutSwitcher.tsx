"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ScrollToTop from "@/components/ScrollToTop";

export default function LayoutSwitcher({
  children,
  isControlCentre: isControlCentreFromServer,
}: {
  children: React.ReactNode;
  isControlCentre?: boolean;
}) {
  const pathname = usePathname();
  const isControlCentreByPath = pathname?.startsWith("/control-centre") ?? false;
  const isControlCentre = isControlCentreFromServer ?? isControlCentreByPath;

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
