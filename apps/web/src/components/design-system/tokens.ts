/** Tokens shown on /design-system, with the role the v2 sheet gives them. */
export const COLOR_TOKENS = [
  ["--bg", "Fond, canvas"],
  ["--node", "Nœuds, cartes"],
  ["--side", "Barre latérale"],
  ["--glass", "Flottants"],
  ["--glass-hi", "Menus, palette"],
  ["--tx", "Texte"],
  ["--tx2", "Secondaire"],
  ["--tx3", "Méta, AA 5,1:1"],
  ["--lane", "Compartiments"],
  ["--acc", "Cuivre, action"],
  ["--acc-tx", "Cuivre, texte"],
  ["--acc-soft", "Sélection"],
  ["--sunk", "Champs, tuiles"],
  ["--hair", "Filets"],
  ["--edge", "Liens"],
  ["--scrim", "Voile"],
] as const;

export const STATE_TOKENS = [
  ["prop", "À revoir, proposé"],
  ["val", "Validé, réussi"],
  ["run", "En cours"],
  ["err", "Erreur"],
  ["pii", "Pseudonymisé"],
] as const;

export const TYPE_SCALE = [
  ["Titre écran 28 · 600", "Modèle en étoile", "text-title font-semibold"],
  ["Titre panneau 18 · 600", "dim_clients", "text-panel font-semibold"],
  ["Section 16 · 600", "À résoudre", "text-section font-semibold"],
  ["Lecture 18 · 400", "Le chiffre d’affaires HT, par mois", "text-read"],
  ["Corps 14,5 · 400", "94 % des valeurs existent dans clients.id_client.", "text-body"],
  ["Interface min. 13", "Proposé il y a 12 min", "text-meta text-tx3"],
  ["Mono 12,5 · 400", "commandes.id_client · run_0418", "font-mono text-mono"],
  ["Chiffres tabulaires", "1 240,00 € · 2 015,80 € · 712,00 €", "text-body tabular-nums"],
] as const;

export const RADII = [
  ["6", "rounded-xs"],
  ["9", "rounded-sm"],
  ["10", "rounded-md"],
  ["12", "rounded-lg"],
  ["16", "rounded-xl"],
  ["20", "rounded-2xl"],
  ["24", "rounded-3xl"],
] as const;

export const SHADOWS = [
  ["sm", "shadow-sm"],
  ["nœud", "shadow-node"],
  ["survol", "shadow-hover"],
  ["flottant", "shadow-float"],
] as const;

export const MOTION = [
  ["Rapide", "120 ms", "survol, sélection"],
  ["Base", "200 ms", "couleurs, ombres"],
  ["Étape", "300 ms", "apparition des étapes de l’agent"],
  ["Mise en page", "320 ms", "barre latérale, compartiments"],
  ["Inspecteur", "ressort 380 / 34", "sheet depuis la droite"],
  ["Canvas", "440 ms", "zoom et ajustement"],
  ["Courbe", "cubic-bezier(.32, .72, 0, 1)", "toutes les transitions"],
] as const;
