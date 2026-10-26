"use client";

import { useEffect, useRef, useState } from "react";
import { nodeLook, type ProjectGraph } from "@/lib/pipeline/model";

const SPOKEN: Partial<Record<string, string>> = {
  running: "en cours",
  error: "en erreur",
  pending: "en attente",
};

/**
 * Text for an aria-live region: the nodes whose run state changed since the previous
 * graph (« dim_clients : en cours », « fct_ventes : réussi »).
 */
export function useRunAnnouncements(graph: ProjectGraph): string {
  const previous = useRef<Map<string, string> | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    const states = new Map(
      graph.nodes.map((n) => {
        const look = nodeLook(n);
        return [n.id, look.kind === "val" ? "réussi" : (SPOKEN[n.state] ?? "")];
      }),
    );
    const before = previous.current;
    previous.current = states;
    if (!before) return;
    const changes = graph.nodes
      .filter((n) => states.get(n.id) && states.get(n.id) !== before.get(n.id))
      .map((n) => `${n.name} : ${states.get(n.id)}`);
    if (changes.length) setText(changes.slice(0, 6).join(". "));
  }, [graph]);
  return text;
}
