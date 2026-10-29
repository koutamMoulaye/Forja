# Guide analyst : demander un data mart

Un analyst n'a pas besoin de connaître les tables : il pose sa question en français et
vérifie ce que Forja a compris avant toute publication. Connexion :
<http://localhost:3000>, arrivée sur l'**Accueil**.

## 1. Poser une question

Sur l'accueil, écrivez par exemple « Chiffre d'affaires par mois et par ville en 2024,
clients Pro », ou partez d'une suggestion ou d'un indicateur du catalogue
(*Indicateurs*). Forja indique la fraîcheur des données (« mis à jour ce matin à 06:00 »).

La conversation montre la préparation étape par étape. Les questions simples sont
comprises immédiatement ; les autres passent par l'analyse approfondie, qui peut prendre
un moment : « Me prévenir à la fin » vous laisse travailler ailleurs, une notification
annonce le résultat.

Si un terme est ambigu (« ventes » : chiffre d'affaires ou quantité ?), Forja pose une
question avec deux à quatre choix, chacun avec ce qu'il couvre (« 1 284 clients »). Il
ne devine jamais. Une demande hors du périmètre des données est refusée, avec ce que
Forja sait mesurer.

## 2. Vérifier l'aperçu

« Ouvrir l'aperçu » montre :

- **Ce que Forja a compris**, en une phrase dont chaque terme souligné se corrige d'un
  clic (une autre mesure, un autre grain, une autre période) ;
- les **contrôles** (totaux réconciliés avec le modèle, période couverte, lignes) ;
- un **échantillon** des lignes, données personnelles pseudonymisées, et le SQL ;
- d'où viennent les chiffres (tables du modèle utilisées).

« Affiner » ajoute une consigne (« seulement l'Île-de-France », « par trimestre ») : une
nouvelle version de l'aperçu est calculée.

## 3. Valider et publier

Choisissez la destination (Power BI, base de diffusion, fichier CSV ou Parquet) puis
**Valider et publier**. Selon la configuration, un engineer approuve d'abord : l'étape
« En attente d'approbation » s'affiche, et une notification annonce sa décision, avec le
motif s'il rejette. Une fois publié, le data mart est actualisé à chaque run du modèle ;
l'aperçu propose ses exports.

## 4. Retrouver ses data marts

*Mes data marts* liste vos demandes par statut (brouillons, en attente, publiés). Les
notifications (cloche en haut à droite) récapitulent ce qui s'est passé ; « Activer »
en bas du panneau ajoute les notifications du navigateur, hors de l'onglet Forja.

Un mot n'est pas compris ? Après votre réponse à une question de Forja, vous pouvez
proposer ce mot comme synonyme ; l'équipe data le valide dans la couche sémantique.
