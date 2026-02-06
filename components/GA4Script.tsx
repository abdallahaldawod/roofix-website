"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

type GA4ScriptProps = {
  gaId: string;
};

export default function GA4Script({ gaId }: GA4ScriptProps) {
  const pathname = usePathname();
  const isControlCentrePath = pathname?.startsWith("/control-centre") ?? false;
  if (!gaId || !gaId.startsWith("G-") || isControlCentrePath) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){ dataLayer.push(arguments); }
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${gaId}', { anonymize_ip: true });
        `}
      </Script>
    </>
  );
}
