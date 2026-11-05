# Journal des tests manuels

Ce que la personne en charge du projet constate en utilisant Forja à la main, cas par
cas, et ce qui en a été fait. Les tests automatisés sont recensés dans
[campaign-report.md](campaign-report.md) ; ce journal couvre la campagne de tests
manuels qui suit la 0.1.0.

Une anomalie garde sa ligne une fois corrigée : la colonne « Correction » renvoie à la
pull request et au test qui l'empêche de revenir.

## Gravité

| Gravité | Sens |
|---|---|
| Bloquant | Le parcours s'arrête : aucun contournement depuis l'interface. |
| Majeur | Le parcours aboutit, mais mal : contenu masqué, action trompeuse, donnée fausse. |
| Mineur | Gêne réelle, facile à contourner. |
| Cosmétique | Apparence seulement. |

## Statut

`ouvert` (constaté, pas encore pris), `en cours` (une branche existe), `corrigé` (fusionné
dans `main`, CI verte), `vérifié` (revu à la main après correction), `rejeté` (pas une
anomalie ; la raison est dans « Correction »).

## Anomalies

| N° | Cas | Étape | Constat | Gravité | Statut | Correction |
|---|---|---|---|---|---|---|
| MT-1 | 1 | Créer un projet, connecté en administrateur | Impossible depuis l'interface : le sélecteur de projet ne liste que les projets existants, et la page des projets renvoie à l'API. | Bloquant | corrigé | [#4](https://github.com/koutamMoulaye/Forja/pull/4) : « Nouveau projet » dans le sélecteur et sur `/projects` (administrateur de l'instance), puis *Réglages › Membres › Ajouter un membre*, mode local compris. Test : `apps/web/e2e/15-manual-case-1.spec.ts` (MT-1), `tests/test_auth.py`. |
| MT-2 | 1 | Canvas du pipeline, à l'ouverture et après « Ajuster » | La barre supérieure transparente (sélecteur de projet, fil d'Ariane) chevauche les titres des compartiments (Sources, Nettoyage). | Majeur | corrigé | [#4](https://github.com/koutamMoulaye/Forja/pull/4) : « Ajuster » cadrait déjà sous la barre ; c'était la caméra mémorisée après un zoom, restaurée à la visite suivante, et la barre latérale ouverte par-dessus le canvas. La caméra restaurée garde son zoom sous la barre et à droite de la barre latérale ; ouvrir ou replier celle-ci recadre. Test : `apps/web/e2e/15-manual-case-1.spec.ts` (MT-2), captures avant/après dans les deux thèmes. |
