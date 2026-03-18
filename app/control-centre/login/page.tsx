import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

type LoginPageProps = { searchParams?: Promise<Record<string, string | string[] | undefined>> };

export default async function ControlCentreLoginPage(props: LoginPageProps) {
  const resolved = props.searchParams ? await props.searchParams : null;
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-neutral-100">
        <p className="text-neutral-600">Loading…</p>
      </div>
    }>
      <LoginForm searchParams={resolved} />
    </Suspense>
  );
}
