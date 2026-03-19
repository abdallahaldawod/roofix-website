import { ControlCentreWrapper } from "./control-centre-wrapper";
import { RegisterControlCentreSW } from "./register-sw";

export const metadata = {
  title: "Control Centre",
  robots: { index: false, follow: false } as const,
  manifest: "/control-centre.webmanifest",
};

export default function ControlCentreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ControlCentreWrapper>
      <RegisterControlCentreSW />
      {children}
    </ControlCentreWrapper>
  );
}
