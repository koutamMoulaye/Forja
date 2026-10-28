import type { components } from "@/lib/api/schema";

export type InvitationStatus = components["schemas"]["InvitationStatus"];

/** The registration link an administrator sends: /auth/invite/<token> on this site. */
export function invitationLink(token: string, origin = window.location.origin): string {
  return `${origin}/auth/invite/${encodeURIComponent(token)}`;
}

/** What the invitation page says when the link cannot be used. */
export function invitationProblem(
  status: InvitationStatus["status"],
): { title: string; description: string } | null {
  switch (status) {
    case "valid":
      return null;
    case "expired":
      return {
        title: "Invitation expirée",
        description:
          "Ce lien n’est plus valable. Demandez à l’administrateur du projet de vous inviter à nouveau.",
      };
    case "revoked":
      return {
        title: "Invitation révoquée",
        description:
          "L’administrateur du projet a retiré cette invitation. Contactez-le si vous pensez qu’il s’agit d’une erreur.",
      };
    case "used":
      return {
        title: "Invitation déjà utilisée",
        description: "Un compte a déjà été créé avec ce lien : connectez-vous avec votre adresse.",
      };
    default:
      return {
        title: "Lien d’invitation inconnu",
        description:
          "Vérifiez que le lien est complet, ou demandez une nouvelle invitation à l’administrateur.",
      };
  }
}
