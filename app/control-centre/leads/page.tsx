import { LeadsPageClient } from "./LeadsPageClient";

type LeadsPageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function LeadsPage(props: LeadsPageProps) {
  const resolved = props.searchParams ? await props.searchParams : null;
  return <LeadsPageClient searchParams={resolved} />;
}
