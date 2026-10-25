# Maquettes de Forja

Référence visuelle versionnée de l'interface. Les fichiers `.dc.html` s'ouvrent dans un
navigateur (ils chargent `project/support.js`) ; ce sont des prototypes, pas du code de
production.

## Source de vérité

- `project/ForjaApp.dc.html` : composant qui contient le code réel de tous les écrans
  (canvas du pipeline, nœuds, compartiments, inspecteur, palette ⌘K, premier lancement,
  modèle en étoile, runs, couche sémantique, écrans analyst, réglages, connexion), les
  tokens clair et sombre, Instrument Sans et Commit Mono, et le logotype Strate.
- `project/Forja Recuit v3.dc.html` : planche de présentation qui affiche ForjaApp. Son
  tableau « Écrans et routes » et son inventaire de composants indiquent quel écran
  utiliser pour chaque route.
- `project/Forja Recuit v2.dc.html` : écrans V2 à V7 (sélection et inspecteur, palette,
  premier lancement, profilage, modèle, runs), rendus eux aussi par ForjaApp.

## Obsolètes

- `project/ForjaCanvas.dc.html` et `project/Forja C - Recuit.dc.html` : ancienne
  typographie (Inter, JetBrains Mono). Ne pas en reprendre les styles. Seules les valeurs
  de la section Mouvement et de la note d'animation de Forja C restent valables
  (ressort panneau 380/34, ressort léger 520/38, glissement 320 ms, fondu 200 à 260 ms,
  flux 800 ms).
- `Archive/` : directions A (Acier) et B (Atelier), écartées.
