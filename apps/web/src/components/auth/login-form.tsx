"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LockSimple, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { ApiError, WEB_ERROR_CODES } from "@/lib/api/errors";
import { signIn } from "@/lib/auth/auth-client";
import { formatDelay, lockoutFor, useCountdown, type Lockout } from "@/lib/use-countdown";
import { AuthAlert, AuthScreen, useHealth } from "./auth-screen";

export function loginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "Connexion impossible pour le moment.";
  if (error.status === 401) return "Adresse e-mail ou mot de passe incorrect.";
  if (error.status === 422) return "Saisissez votre adresse e-mail et votre mot de passe.";
  if (error.code === WEB_ERROR_CODES.csrf) return "La page a expiré. Rechargez-la, puis réessayez.";
  if (error.status === 0 || error.status === 502 || error.code === WEB_ERROR_CODES.apiUnreachable) {
    return "L’API Forja ne répond pas. Vérifiez qu’elle est lancée.";
  }
  return "Connexion impossible pour le moment.";
}

/** S7, the sign-in screen. */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const health = useHealth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [lockout, setLockout] = useState<Lockout | null>(null);
  const remaining = useCountdown(lockout);
  const locked = lockout !== null && remaining > 0;

  const mutation = useMutation({
    mutationFn: () => signIn({ email, password, remember, next: params.get("next") }),
    onSuccess: (result) => {
      queryClient.clear();
      router.replace(result.redirect);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429) {
        setLockout(lockoutFor(error.retryAfter ?? 60));
        setPassword("");
      }
    },
  });

  const error = mutation.error;
  const showError = error && !(error instanceof ApiError && error.status === 429);
  const mode = health.data?.auth_mode;

  return (
    <AuthScreen
      title="Connexion"
      subtitle={mode === "multi" ? "Instance partagée de Forja" : "Forja sur ce poste"}
    >
      <form
        noValidate
        className="flex flex-col gap-[18px]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!locked && email && password) mutation.mutate();
        }}
      >
        <Field label="Adresse e-mail">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              size="lg"
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              spellCheck={false}
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          )}
        </Field>
        <Field label="Mot de passe">
          {({ id, describedBy }) => (
            <PasswordInput
              id={id}
              aria-describedby={describedBy}
              size="lg"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={
                showError && error instanceof ApiError && error.status === 401 ? true : undefined
              }
            />
          )}
        </Field>

        {locked ? (
          <AuthAlert icon={<LockSimple size={18} weight="fill" />} title="Connexion verrouillée">
            Trop de tentatives échouées. Réessayez dans{" "}
            <span className="font-semibold text-tx tabular-nums" data-testid="lockout-countdown">
              {formatDelay(remaining)}
            </span>
            .
          </AuthAlert>
        ) : showError ? (
          <AuthAlert
            icon={<WarningCircle size={18} weight="fill" />}
            title={loginErrorMessage(error)}
          />
        ) : null}

        <Button
          type="submit"
          variant="primary"
          size="xl"
          className="mt-1 w-full"
          loading={mutation.isPending}
          disabled={locked || !email || !password}
        >
          Se connecter
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-ui">
          <label className="flex cursor-pointer items-center gap-2 text-tx2">
            <Checkbox
              checked={remember}
              onCheckedChange={(value) => setRemember(value === true)}
              name="remember"
            />
            Rester connecté
          </label>
          {/* No self-service reset: the administrator sets a new initial password. */}
          <span className="text-tx3" title="Mot de passe oublié">
            Demandez à votre administrateur
          </span>
        </div>
      </form>
    </AuthScreen>
  );
}
