"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinkBreak, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_LABELS } from "@/components/shell/shell-context";
import { ApiError } from "@/lib/api/errors";
import { lookupInvitation, register } from "@/lib/auth/auth-client";
import { invitationProblem } from "@/lib/auth/invitation";
import { formatDateTime } from "@/lib/format";
import { AuthAlert, AuthScreen } from "./auth-screen";
import { PasswordRequirements, passwordErrorMessage, registrationChecks } from "./password-form";

function registerError(error: unknown): string {
  if (error instanceof ApiError && error.status === 401) {
    return /revoked/.test(error.message)
      ? "Cette invitation vient d’être révoquée."
      : /expired/.test(error.message)
        ? "Cette invitation a expiré entre-temps."
        : "Cette invitation n’est plus valable.";
  }
  if (error instanceof ApiError && error.status === 409) {
    return "Un compte existe déjà pour cette adresse : connectez-vous.";
  }
  return passwordErrorMessage(error);
}

/** /auth/invite/[token]: name and password of a new account, then straight in (S7, S8). */
export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const invitation = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => lookupInvitation(token),
    retry: false,
    staleTime: Infinity,
  });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const email = invitation.data?.email ?? "";
  const checks = registrationChecks(email, password, confirmation);
  const ready = checks.every((check) => check.ok) && name.trim().length > 0;

  const mutation = useMutation({
    mutationFn: () => register({ token, password, name: name.trim() }),
    onSuccess: (result) => {
      queryClient.clear();
      router.replace(result.redirect);
    },
  });

  if (invitation.isPending) {
    return (
      <AuthScreen title="Créer votre compte" subtitle="Lecture de l’invitation…">
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Chargement">
          <Skeleton className="h-[46px] w-full rounded-lg" />
          <Skeleton className="h-[46px] w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-[13px]" />
        </div>
      </AuthScreen>
    );
  }
  if (invitation.isError) {
    return (
      <AuthScreen title="Créer votre compte" subtitle="Invitation à un projet Forja">
        <AuthAlert icon={<WarningCircle size={18} weight="fill" />} title="Invitation illisible">
          {invitation.error instanceof ApiError && invitation.error.status === 429
            ? "Trop d’essais depuis ce poste. Réessayez dans quelques minutes."
            : "L’API Forja ne répond pas. Réessayez dans un instant."}
        </AuthAlert>
        <Button variant="secondary" size="xl" onClick={() => void invitation.refetch()}>
          Réessayer
        </Button>
      </AuthScreen>
    );
  }
  const problem = invitationProblem(invitation.data.status);
  if (problem) {
    return (
      <AuthScreen
        title={problem.title}
        subtitle={
          invitation.data.project_name
            ? `Projet ${invitation.data.project_name}`
            : "Invitation à un projet Forja"
        }
      >
        <div data-testid="invite-problem" className="flex items-start gap-3">
          <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-sunk text-tx2">
            <LinkBreak size={22} />
          </span>
          <p className="m-0 text-[14.5px] leading-normal text-tx2">{problem.description}</p>
        </div>
        <Button asChild variant="primary" size="xl" className="mt-1 w-full">
          <Link href="/auth/login">Aller à la connexion</Link>
        </Button>
      </AuthScreen>
    );
  }

  const { project_name: project, role, expires_at: expires } = invitation.data;
  return (
    <AuthScreen
      title="Créer votre compte"
      subtitle={
        <>
          Invitation dans <span className="font-semibold text-tx">{project}</span>, rôle{" "}
          {role ? ROLE_LABELS[role] : "membre"}
          {expires ? `, jusqu’au ${formatDateTime(expires)}` : ""}.
        </>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-[18px]"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) mutation.mutate();
        }}
      >
        <Field label="Adresse e-mail">
          {({ id }) => (
            <Input
              id={id}
              size="lg"
              name="username"
              autoComplete="username"
              value={email}
              readOnly
              aria-readonly
              className="text-tx2"
            />
          )}
        </Field>
        <Field label="Nom">
          {({ id }) => (
            <Input
              id={id}
              size="lg"
              name="name"
              autoComplete="name"
              autoFocus
              placeholder="Prénom et nom"
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Mot de passe">
          {({ id }) => (
            <PasswordInput
              id={id}
              size="lg"
              name="new-password"
              autoComplete="new-password"
              aria-describedby="password-requirements"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <Field label="Confirmation">
          {({ id }) => (
            <PasswordInput
              id={id}
              size="lg"
              name="confirm-password"
              autoComplete="new-password"
              placeholder="Saisissez-le à nouveau"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          )}
        </Field>
        <PasswordRequirements checks={checks} />
        {mutation.error ? (
          <AuthAlert
            icon={<WarningCircle size={18} weight="fill" />}
            title={registerError(mutation.error)}
          />
        ) : null}
        <Button
          type="submit"
          variant="primary"
          size="xl"
          className="mt-1 w-full"
          disabled={!ready}
          loading={mutation.isPending}
        >
          Créer mon compte
        </Button>
      </form>
    </AuthScreen>
  );
}
