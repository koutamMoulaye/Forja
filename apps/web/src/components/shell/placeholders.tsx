"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenText,
  Broadcast,
  Broom,
  ChartPieSlice,
  ChatCircleText,
  ClockCounterClockwise,
  Cube,
  Files,
  GearSix,
  Graph,
  House,
  ListMagnifyingGlass,
  ShieldCheck,
  type Icon,
} from "@phosphor-icons/react";
import { landingFor } from "@/lib/session/views";
import { ComingSoon } from "./coming-soon";
import { useShell } from "./shell-context";

type Screen = {
  icon: Icon;
  title: string;
  subtitle?: string;
  heading: string;
  description: string;
  step?: string;
  mockup?: string;
  canvas?: boolean;
};

/** Screens of the v3 route summary that later steps fill in. */
export const SCREENS = {
  pipeline: {
    icon: Graph,
    title: "Pipeline",
    heading: "Le canvas du pipeline arrive",
    description:
      "Sources, nettoyage, modèle en étoile et diffusion sur un seul canvas, avec la lignée de chaque table et l’inspecteur à droite.",
    step: "5b",
    mockup: "S1",
    canvas: true,
  },
  sources: {
    icon: Files,
    title: "Sources",
    subtitle: "Fichiers chargés, versions et profils",
    heading: "Vos fichiers et leur profil",
    description: "Fichiers chargés, versions successives, qualité mesurée et dérives de schéma.",
  },
  "silver-plan": {
    icon: Broom,
    title: "Revue du plan Silver",
    subtitle: "Règle par règle, avec l’aperçu avant et après",
    heading: "La revue du plan de nettoyage arrive",
    description:
      "Validez, modifiez ou rejetez chaque règle proposée avant de construire la table nettoyée.",
    mockup: "v1 C3",
  },
  cleaning: {
    icon: Broom,
    title: "Nettoyage",
    subtitle: "Plans Silver de chaque source",
    heading: "Les plans de nettoyage, règle par règle",
    description:
      "Chaque source reçoit un plan proposé après le profilage ; vous le relisez avant qu’il soit appliqué.",
    mockup: "v1 C3",
  },
  model: {
    icon: Cube,
    title: "Modèle en étoile",
    subtitle: "Faits, dimensions et historisation",
    heading: "La revue du modèle en étoile arrive",
    description:
      "Grain, clés, mesures et historisation des dimensions, avec les points à résoudre avant validation.",
    mockup: "v2 V6",
  },
  serving: {
    icon: Broadcast,
    title: "Diffusion",
    subtitle: "Data marts et destinations",
    heading: "Data marts et destinations",
    description:
      "Publication vers Power BI, Superset et exports planifiés, avec l’approbation des data marts demandés.",
  },
  runs: {
    icon: ClockCounterClockwise,
    title: "Runs",
    subtitle: "Historique des exécutions",
    heading: "L’historique des runs arrive",
    description:
      "Étapes, métriques, tests dbt et journal de chaque exécution. Le run en cours est déjà suivi dans la barre du haut.",
    mockup: "v2 V7",
  },
  "run-detail": {
    icon: ClockCounterClockwise,
    title: "Détail du run",
    heading: "Le détail du run arrive",
    description: "Étapes, lignes lues et rejetées, tests dbt et journal complet.",
    mockup: "v2 V7",
  },
  semantic: {
    icon: BookOpenText,
    title: "Couche sémantique",
    subtitle: "Métriques, dimensions et synonymes",
    heading: "La couche sémantique arrive",
    description: "Libellés métier, formules, additivité et synonymes proposés par les analysts.",
    mockup: "S3",
  },
  governance: {
    icon: ShieldCheck,
    title: "Gouvernance",
    subtitle: "Accès, pseudonymisation et audit",
    heading: "Gouvernance du projet",
    description: "Journal d’audit, colonnes pseudonymisées et droits par rôle.",
  },
  settings: {
    icon: GearSix,
    title: "Réglages du projet",
    subtitle: "Membres, fournisseur IA et clés API",
    heading: "Les réglages du projet arrivent",
    description: "Membres et invitations, fournisseur IA et clés API personnelles.",
    mockup: "S6",
  },
  home: {
    icon: House,
    title: "Accueil",
    subtitle: "Vos questions et vos data marts",
    heading: "Votre accueil arrive",
    description:
      "Posez une question en français, retrouvez vos questions récentes et les indicateurs disponibles.",
    mockup: "S4",
  },
  ask: {
    icon: ChatCircleText,
    title: "Poser une question",
    subtitle: "L’agent prépare un data mart vérifiable",
    heading: "L’agent métier arrive",
    description:
      "Décrivez ce que vous voulez voir ; Forja demande les précisions utiles et prépare un aperçu à vérifier.",
    mockup: "S9",
  },
  marts: {
    icon: ChartPieSlice,
    title: "Mes data marts",
    subtitle: "Brouillons, aperçus et publications",
    heading: "Vos data marts arrivent",
    description: "Affinez, exportez ou suivez l’approbation de chaque data mart.",
    mockup: "S5",
  },
  "mart-preview": {
    icon: ListMagnifyingGlass,
    title: "Aperçu de vérification",
    subtitle: "Vérifiez avant toute publication",
    heading: "L’aperçu de vérification arrive",
    description:
      "Ce que Forja a compris, les contrôles de cohérence et les premières lignes du data mart.",
    mockup: "v1 C5",
  },
  metrics: {
    icon: BookOpenText,
    title: "Indicateurs",
    subtitle: "Ce que vous pouvez demander",
    heading: "Le catalogue des indicateurs arrive",
    description: "Chaque indicateur disponible, sa définition et les axes d’analyse possibles.",
  },
} satisfies Record<string, Screen>;

export type ScreenId = keyof typeof SCREENS;

export function Placeholder({ screen }: { screen: ScreenId }) {
  const definition: Screen = SCREENS[screen];
  return (
    <ComingSoon
      icon={definition.icon}
      title={definition.title}
      subtitle={definition.subtitle}
      heading={definition.heading}
      description={definition.description}
      step={definition.step}
      mockup={definition.mockup}
      canvas={definition.canvas}
    />
  );
}

/** /projects/[projectId] alone: the role's landing page. */
export function ProjectIndex() {
  const shell = useShell();
  const router = useRouter();
  useEffect(() => {
    router.replace(landingFor(shell.project.id, shell.view));
  }, [router, shell.project.id, shell.view]);
  return null;
}
