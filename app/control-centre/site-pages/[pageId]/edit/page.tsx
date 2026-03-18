import { EditPageClient } from "./EditPageClient";

type EditPagePageProps = { params: Promise<{ pageId?: string }> };

export default async function EditPagePage(props: EditPagePageProps) {
  const params = await props.params;
  const pageId = typeof params?.pageId === "string" ? params.pageId : "";
  return <EditPageClient pageId={pageId} />;
}
