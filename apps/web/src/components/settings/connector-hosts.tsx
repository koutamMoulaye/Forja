"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldWarning } from "@phosphor-icons/react";
import { Card, Code, SectionTitle } from "@/components/screens/screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { cn } from "@/lib/cn";
import { connectionKeys, useConnectorSettings } from "@/lib/connections/queries";

/**
 * Private or local addresses REST API connections may reach. Everything else private is
 * refused (SSRF protection); only the instance administrator changes the list.
 */
export function ConnectorHosts({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const settings = useConnectorSettings();
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (hosts: string[]) =>
      unwrap(await api.PUT("/settings/connectors", { body: { allowed_hosts: hosts } })),
    onSuccess: (saved) => {
      queryClient.setQueryData(connectionKeys.settings(), saved);
      setDraft(null);
      toast.success({ title: "Adresses autorisées enregistrées" });
    },
    onError: (error) =>
      toast.error({
        title: "Adresses non enregistrées",
        description: error instanceof ApiError ? error.message : undefined,
      }),
  });
  const saved = settings.data?.allowed_hosts ?? [];
  const text = draft ?? saved.join("\n");
  const hosts = text
    .split(/[\n,]/)
    .map((h) => h.trim())
    .filter(Boolean);

  return (
    <Card
      className={cn("flex flex-col gap-2 px-5 py-[18px]", className)}
      data-testid="connector-hosts"
    >
      <SectionTitle>Connecteurs</SectionTitle>
      <span className="flex items-start gap-2 text-ui text-tx2">
        <ShieldWarning size={18} className="mt-px flex-none text-tx3" />
        Les connexions API ne joignent pas les adresses privées ou locales (réseau interne, poste
        local), sauf celles listées ici : un hôte, une adresse IP ou une plage CIDR par ligne.
      </span>
      {settings.isPending ? (
        <Skeleton className="h-24 w-full rounded-lg" />
      ) : (
        <>
          <label htmlFor="connector-hosts" className="text-meta font-semibold text-tx2">
            Adresses autorisées
          </label>
          <textarea
            id="connector-hosts"
            value={text}
            disabled={!settings.data?.editable}
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            placeholder={"crm.interne\n10.0.0.0/8"}
            className="w-full resize-y rounded-[11px] border-0 bg-sunk px-3 py-2.5 font-mono text-mono text-tx outline-none focus-visible:shadow-[0_0_0_2px_var(--acc)]"
          />
          {settings.data?.environment_hosts.length ? (
            <span className="text-meta text-tx3">
              Aussi autorisées par l’environnement :{" "}
              {settings.data.environment_hosts.map((h) => (
                <Code key={h} className="mr-1">
                  {h}
                </Code>
              ))}
            </span>
          ) : null}
          {settings.data?.editable ? (
            <div className="flex justify-end">
              <Button
                variant="tonal"
                disabled={draft === null}
                loading={save.isPending}
                onClick={() => save.mutate(hosts)}
              >
                Enregistrer
              </Button>
            </div>
          ) : (
            <span className="text-meta text-tx3">Réservé à l’administrateur de l’instance.</span>
          )}
        </>
      )}
    </Card>
  );
}
