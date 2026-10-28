"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Circle, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Field, PasswordInput } from "@/components/ui/input";
import { ApiError, WEB_ERROR_CODES } from "@/lib/api/errors";
import { changePassword, signOut } from "@/lib/auth/auth-client";
import { cn } from "@/lib/cn";
import { AuthAlert, AuthScreen } from "./auth-screen";

export const MIN_PASSWORD_LENGTH = 12;

export type PasswordCheck = { label: string; ok: boolean };

/** The four requirements of the S8 mockup, in order. */
export function passwordChecks(
  current: string,
  next: string,
  confirmation: string,
): PasswordCheck[] {
  return [
    { label: `${MIN_PASSWORD_LENGTH} caractères minimum`, ok: next.length >= MIN_PASSWORD_LENGTH },
    { label: "Une majuscule et un chiffre", ok: /\p{Lu}/u.test(next) && /\d/.test(next) },
    { label: "Différent du mot de passe initial", ok: next.length > 0 && next !== current },
    { label: "Confirmation identique", ok: confirmation.length > 0 && confirmation === next },
  ];
}

/** Same rules for a new account: the email replaces the initial password. */
export function registrationChecks(
  email: string,
  next: string,
  confirmation: string,
): PasswordCheck[] {
  const lower = next.toLowerCase();
  return [
    { label: `${MIN_PASSWORD_LENGTH} caractères minimum`, ok: next.length >= MIN_PASSWORD_LENGTH },
    { label: "Une majuscule et un chiffre", ok: /\p{Lu}/u.test(next) && /\d/.test(next) },
    {
      label: "Différent de votre adresse e-mail",
      ok: next.length > 0 && !email.toLowerCase().includes(lower),
    },
    { label: "Confirmation identique", ok: confirmation.length > 0 && confirmation === next },
  ];
}

/** The meter and the list of requirements under the password fields (S8). */
export function PasswordRequirements({ checks }: { checks: PasswordCheck[] }) {
  const satisfied = checks.filter((check) => check.ok).length;
  return (
    <>
      <div
        className="flex gap-1"
        role="meter"
        aria-label="Exigences satisfaites"
        aria-valuemin={0}
        aria-valuemax={checks.length}
        aria-valuenow={satisfied}
      >
        {checks.map((check, index) => (
          <span
            key={check.label}
            className={cn(
              "h-1 flex-1 rounded-[2px] transition-colors duration-300 ease-soft",
              index < satisfied ? "bg-val-fg" : "bg-sunk",
            )}
          />
        ))}
      </div>
      <ul id="password-requirements" className="m-0 flex list-none flex-col gap-1.5 p-0">
        {checks.map((check) => (
          <li key={check.label} className="flex items-center gap-2 text-ui text-tx2">
            {check.ok ? (
              <CheckCircle size={17} weight="fill" className="text-val-fg" aria-label="Satisfait" />
            ) : (
              <Circle size={17} className="text-tx3" aria-label="Non satisfait" />
            )}
            {check.label}
          </li>
        ))}
      </ul>
    </>
  );
}

export function passwordErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Enregistrement impossible pour le moment.";
  if (error.status === 401 && error.code !== WEB_ERROR_CODES.sessionExpired) {
    return "Le mot de passe initial est incorrect.";
  }
  if (error.code === WEB_ERROR_CODES.sessionExpired)
    return "Votre session a expiré. Reconnectez-vous.";
  if (error.status === 422 && error.message) {
    return error.message.charAt(0).toUpperCase() + error.message.slice(1) + ".";
  }
  if (error.code === WEB_ERROR_CODES.csrf) return "La page a expiré. Rechargez-la, puis réessayez.";
  if (error.status === 0 || error.status === 502) {
    return "L’API Forja ne répond pas. Vérifiez qu’elle est lancée.";
  }
  return "Enregistrement impossible pour le moment.";
}

/** S8: the initial password is replaced before anything else. */
export function PasswordForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const checks = passwordChecks(current, next, confirmation);
  const satisfied = checks.filter((check) => check.ok).length;
  const ready = satisfied === checks.length && current.length > 0;

  const mutation = useMutation({
    mutationFn: () => changePassword({ current_password: current, new_password: next }),
    onSuccess: (result) => {
      queryClient.clear();
      router.replace(result.redirect);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === WEB_ERROR_CODES.sessionExpired) {
        router.replace("/auth/login");
      }
    },
  });

  const leave = async () => {
    await signOut().catch(() => null);
    queryClient.clear();
    router.replace("/auth/login");
  };

  return (
    <AuthScreen
      title="Nouveau mot de passe"
      subtitle="Remplacez le mot de passe initial fourni par votre administrateur."
      footer={
        <button
          type="button"
          onClick={leave}
          className="border-0 bg-transparent p-0 text-[12.5px] font-medium text-tx2 hover:text-tx"
        >
          Se déconnecter
        </button>
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
        {/* Lets password managers attach the new password to the right account. */}
        <input type="text" name="username" autoComplete="username" hidden readOnly />
        <Field label="Mot de passe initial">
          {({ id }) => (
            <PasswordInput
              id={id}
              size="lg"
              name="current-password"
              autoComplete="current-password"
              autoFocus
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          )}
        </Field>
        <Field label="Nouveau mot de passe">
          {({ id }) => (
            <PasswordInput
              id={id}
              size="lg"
              name="new-password"
              autoComplete="new-password"
              aria-describedby="password-requirements"
              value={next}
              onChange={(event) => setNext(event.target.value)}
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
            title={passwordErrorMessage(mutation.error)}
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
          Enregistrer et continuer
        </Button>
      </form>
    </AuthScreen>
  );
}
