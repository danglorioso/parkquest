import { redirect } from "next/navigation";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;
  const redirectTo = params.redirect;
  const query = redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
    ? `?mode=signin&redirect=${encodeURIComponent(redirectTo)}`
    : "?mode=signin";
  redirect(`/${query}`);
}
