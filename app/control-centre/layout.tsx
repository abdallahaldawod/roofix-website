import { ControlCentreWrapper } from "./control-centre-wrapper";

export const metadata = {
  title: "Control Centre",
  robots: { index: false, follow: false } as const,
};

export default function ControlCentreLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ControlCentreWrapper>{children}</ControlCentreWrapper>;
}
