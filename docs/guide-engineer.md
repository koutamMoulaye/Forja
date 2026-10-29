# Guide engineer : d'un fichier à un modèle publié

Ce guide suit le parcours d'un engineer dans l'interface, sur le projet de démo ou sur
vos propres fichiers. Connexion : <http://localhost:3000>, avec un compte engineer ou
administrateur ; l'arrivée se fait sur le **Pipeline**.

## 1. Charger des fichiers

*Sources › Ajouter* (ou glisser des fichiers sur le canvas d'un projet vide). CSV,
Excel (toutes les feuilles), Parquet, JSON. Recharger un fichier du même nom crée une
**nouvelle version** de la source ; la dérive de schéma (colonnes ajoutées, retirées,
retypées) est signalée sans bloquer.

Chaque version est profilée : types, valeurs manquantes, clés candidates, doublons,
données personnelles détectées (colonnes hachurées) et score qualité. La fiche d'une
source montre tout cela, colonne par colonne.

## 2. Relire le plan de nettoyage

Une notification « Plan de nettoyage à revoir » arrive après le profilage. Le plan
(*Nettoyage*, ou *Revoir* sur le nœud du canvas) liste les règles proposées : conversion
de types, normalisation, déduplication, validité, clé primaire, traitement des données
personnelles. Pour chaque règle : son explication, sa confiance, des valeurs avant et
après.

- **Valider**, **Rejeter** ou **Modifier** une règle ; « Valider les règles à confiance
  élevée » traite d'un coup les évidentes.
- **Approuver** le plan, puis **Nettoyer** : le run construit la table Silver avec dbt.
  Les lignes invalides vont en **quarantaine**, avec leur motif ; rien n'est supprimé en
  silence.

## 3. Confirmer les relations et le modèle en étoile

Après le nettoyage, Forja détecte les relations entre sources (inclusion des valeurs,
noms de colonnes, types) ; confirmez ou rejetez-les dans *Modèle*.

« Proposer le modèle » produit un schéma en étoile : dimensions (avec historique SCD2
si besoin), faits au grain explicite, mesures. La proposition vient du fournisseur d'IA
configuré ou, sans IA, de règles déterministes. La liste « À résoudre » signale ce qui
bloque (grain ambigu, relation non confirmée, fan-out). Ajustez, **Valider le modèle**,
puis **Construire** : dbt construit les tables Gold et la couche sémantique est
générée.

## 4. Suivre les runs

Le run en cours s'affiche dans la barre du haut ; le canvas montre chaque table passer
d'« En attente » à « En cours » puis « Réussi ». *Runs* garde l'historique : étapes
table par table, métriques (lignes lues, valides, rejetées), tests dbt et journal. Une
notification annonce la fin ou l'échec, et un lien mène au run.

## 5. Diffuser et gouverner

- *Diffusion* : tables publiées dans la base de diffusion (Power BI, Superset,
  Metabase, voir [bi.md](bi.md)) et exports Parquet ou CSV. Les données personnelles y
  sont pseudonymisées.
- *Couche sémantique* : libellés, synonymes et formules des métriques que l'agent
  utilise ; les synonymes proposés par les analysts y attendent votre validation.
- *À approuver* : les data marts validés par les analysts. L'aperçu est le même que le
  leur ; **Approuver et publier** ou **Rejeter** avec un motif, que l'analyst reçoit.
  En mode multi-utilisateur, votre propre data mart est approuvé par un autre engineer.
- *Gouvernance* : carte des données personnelles par couche et journal d'audit
  (administrateurs), filtrable par utilisateur, action, objet, période et texte.

## Raccourcis

`⌘K` / `Ctrl K` : recherche et actions. Sur le canvas : flèches pour passer d'un nœud à
l'autre, `Entrée` pour l'inspecteur, `Échap` pour le fermer, `+` `-` `0` pour le zoom.
`?` affiche tous les raccourcis.
