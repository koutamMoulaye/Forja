import { Suspense } from "react";
import type { Metadata } from "next";
import { InviteForm } from "@/components/auth/invite-form";

export const metadata: Metadata = { title: "Créer votre compte" };

async function Invitation({ params }: Pick<PageProps<"/auth/invite/[token]">, "params">) {
  const { token } = await params;
  return <InviteForm token={decodeURIComponent(token)} />;
}

/** The token is only known at request time: the page streams it in. */
export default function InvitePage({ params }: PageProps<"/auth/invite/[token]">) {
  return (
    <Suspense fallback={null}>
      <Invitation params={params} />
    </Suspense>
  );
}
