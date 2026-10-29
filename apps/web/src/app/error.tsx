"use client";

import Link from "next/link";
import { StatusPage } from "@/components/screens/status-page";
import { Button } from "@/components/ui/button";

/** An unexpected error while rendering a page: the rest of the app keeps working. */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <StatusPage
      code="500"
      title="Cette page n’a pas pu s’afficher"
      actions={
        <>
          <Button variant="primary" size="lg" onClick={reset}>
            Réessayer
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/">Retour à l’accueil</Link>
          </Button>
        </>
      }
    >
      Une erreur inattendue s’est produite ; vos données ne sont pas touchées.
      {error.digest ? (
        <span className="mt-2 block text-meta text-tx3">
          Référence pour le support : <span className="font-mono text-mono">{error.digest}</span>
        </span>
      ) : null}
    </StatusPage>
  );
}
