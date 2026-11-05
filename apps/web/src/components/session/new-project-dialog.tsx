"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Field, Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { api, unwrap } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { sessionKeys } from "@/lib/session/use-session";
import type { Project } from "@/lib/session/views";

/**
 * Creation of a project by the instance administrator: a name, a description, then the
 * empty canvas of the new project (its first start: the drop zone).
 */
export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const create = useMutation({
    mutationFn: async () =>
      unwrap(
        await api.POST("/projects", {
          body: {
            name: name.trim(),
            description: description.trim() || null,
            architecture: "medallion",
          },
        }),
      ),
    onSuccess: (project) => {
      // The shell finds the project at once, before the list is fetched again.
      queryClient.setQueryData<Project[]>(sessionKeys.projects, (list) => [
        ...(list ?? []),
        project,
      ]);
      void queryClient.invalidateQueries({ queryKey: sessionKeys.projects });
      onOpenChange(false);
      setName("");
      setDescription("");
      toast.success({ title: "Projet créé", description: project.name });
      router.push(`/projects/${project.id}/pipeline`);
    },
    onError: (error) =>
      toast.error({
        title: "Projet non créé",
        description: error instanceof ApiError ? error.message : "Réessayez dans un instant.",
      }),
  });
  const ready = name.trim().length > 0 && !create.isPending;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="new-project-dialog">
        <DialogHeader>
          <DialogTitle>Nouveau projet</DialogTitle>
          <DialogDescription>
            Vous en serez administrateur ; ajoutez ensuite ses membres dans Réglages › Membres.
          </DialogDescription>
        </DialogHeader>
        <form
          id="new-project"
          onSubmit={(event) => {
            event.preventDefault();
            if (ready) create.mutate();
          }}
        >
          <DialogBody className="flex flex-col gap-3">
            <Field label="Nom">
              {({ id }) => (
                <Input
                  id={id}
                  variant="outline"
                  maxLength={100}
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
            </Field>
            <Field label="Description" hint="Facultative : ce que le projet couvre.">
              {({ id, describedBy }) => (
                <textarea
                  id={id}
                  aria-describedby={describedBy}
                  maxLength={1000}
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full resize-y rounded-[11px] border-0 bg-node px-3 py-2.5 font-sans text-body text-tx shadow-[inset_0_0_0_1px_var(--edge)] outline-none focus-visible:shadow-[inset_0_0_0_1px_var(--edge),0_0_0_2px_var(--acc)]"
                />
              )}
            </Field>
          </DialogBody>
        </form>
        <DialogFooter>
          <Button variant="quiet" size="lg" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="primary"
            size="lg"
            type="submit"
            form="new-project"
            loading={create.isPending}
            disabled={!ready}
          >
            Créer le projet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
