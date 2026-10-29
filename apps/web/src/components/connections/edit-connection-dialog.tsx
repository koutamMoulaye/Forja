"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, Input, PasswordInput } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import type { Connection } from "@/lib/connections/queries";
import { authSecret, type AuthKind } from "@/lib/connections/view";

type Params = Record<string, unknown> & {
  host?: string;
  port?: number | null;
  database?: string;
  username?: string;
  base_url?: string;
  auth?: { kind: AuthKind };
};

/**
 * Rename a connection, move it (host, database, account, URL) or replace its credentials.
 * A secret left empty stays as it is: credentials are never shown again.
 */
export function EditConnectionDialog({
  connection,
  onClose,
  onSaved,
}: {
  connection: Connection | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={connection !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="w-[min(560px,calc(100vw-32px))]">
        {connection ? (
          <Editor key={connection.id} connection={connection} onClose={onClose} onSaved={onSaved} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Editor({
  connection,
  onClose,
  onSaved,
}: {
  connection: Connection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const params = connection.params as Params;
  const isApi = connection.type === "rest_api";
  const secret = isApi
    ? authSecret(params.auth?.kind ?? "none")
    : { field: "password", label: "Mot de passe" };
  const [name, setName] = useState(connection.name);
  const [values, setValues] = useState({
    host: params.host ?? "",
    port: params.port ? String(params.port) : "",
    database: params.database ?? "",
    username: params.username ?? "",
    base_url: params.base_url ?? "",
  });
  const [newSecret, setNewSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      const next = isApi
        ? { ...params, base_url: values.base_url.trim() }
        : {
            ...params,
            host: values.host.trim(),
            port: values.port ? Number(values.port) : null,
            database: values.database.trim(),
            username: values.username.trim(),
          };
      unwrap(
        await api.PATCH("/connections/{connection_id}", {
          params: { path: { connection_id: connection.id } },
          body: {
            name: name.trim(),
            params: next,
            secrets: secret && newSecret ? { [secret.field]: newSecret } : {},
          },
        }),
      );
      toast.success({
        title: "Connexion modifiée",
        description: "Testez-la avant le prochain chargement.",
      });
      onSaved();
      onClose();
    } catch (error) {
      toast.error({
        title: "Modification impossible",
        description: error instanceof ApiError ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Modifier {connection.name}</DialogTitle>
        <DialogDescription>
          Les identifiants enregistrés ne sont jamais réaffichés ; laissez le champ vide pour les
          garder.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3">
        <Field label="Nom">
          {({ id }) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        {isApi ? (
          <Field label="URL de base">
            {({ id }) => <Input id={id} value={values.base_url} onChange={set("base_url")} />}
          </Field>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_120px] gap-3">
              <Field label="Hôte">
                {({ id }) => <Input id={id} value={values.host} onChange={set("host")} />}
              </Field>
              <Field label="Port">
                {({ id }) => (
                  <Input id={id} value={values.port} inputMode="numeric" onChange={set("port")} />
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Base de données">
                {({ id }) => <Input id={id} value={values.database} onChange={set("database")} />}
              </Field>
              <Field label="Utilisateur">
                {({ id }) => <Input id={id} value={values.username} onChange={set("username")} />}
              </Field>
            </div>
          </>
        )}
        {secret ? (
          <Field
            label={`Nouveau ${secret.label.toLowerCase()}`}
            hint={
              (connection.secrets_set ?? []).includes(secret.field)
                ? "Enregistré ; vide : inchangé."
                : "Aucun enregistré."
            }
          >
            {({ id, describedBy }) => (
              <PasswordInput
                id={id}
                aria-describedby={describedBy}
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                autoComplete="new-password"
              />
            )}
          </Field>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="quiet" onClick={onClose}>
          Annuler
        </Button>
        <Button
          variant="primary"
          loading={saving}
          disabled={!name.trim()}
          onClick={() => void save()}
        >
          Enregistrer
        </Button>
      </DialogFooter>
    </>
  );
}
