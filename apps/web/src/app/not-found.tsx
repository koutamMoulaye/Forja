import type { Metadata } from "next";
import Link from "next/link";
import { StatusPage } from "@/components/screens/status-page";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <StatusPage
      code="404"
      title="Cette page n’existe pas"
      actions={
        <Button asChild variant="primary" size="lg">
          <Link href="/">Retour à l’accueil</Link>
        </Button>
      }
    >
      L’adresse est peut-être incomplète, ou l’élément a été supprimé. Vos projets restent
      accessibles depuis l’accueil.
    </StatusPage>
  );
}
