# Démarrer

*English: [en/getting-started.md](en/getting-started.md)*

Ce guide installe Forja avec Docker, ouvre le projet de démo et indique la suite.

## Prérequis

- [Docker](https://docs.docker.com/get-docker/) avec Compose v2 (Docker Desktop sous
  Windows et macOS, Docker Engine sous Linux).
- Environ 4 Go d'espace disque libre (12 Go avec un conteneur Ollama et un modèle).
- 8 Go de mémoire ou plus est confortable ; DuckDB prend par défaut la moitié de la
  mémoire disponible au démarrage et déborde sur disque au-delà.
- linux/amd64 ou linux/arm64 : les images existent pour les deux, donc les Mac Apple
  silicon, Windows sur ARM et les serveurs ARM exécutent Forja en natif.

## Installation en une commande

```sh
git clone https://github.com/forjadata/forja.git && cd forja
./install.sh --demo            # macOS, Linux
.\install.ps1 -Demo            # Windows (PowerShell)
```

Le script vérifie Docker et l'espace disque, télécharge les deux images publiées
(`ghcr.io/forjadata/forja-api` et `forja-web`), crée l'administrateur, charge le projet
de démo avec `--demo`, démarre le tout et ouvre <http://localhost:3000>.

**Le mot de passe de l'administrateur et ceux des comptes de démo ne s'affichent
qu'une fois** : notez-les. La première connexion demande d'en choisir un nouveau.

| Option | `install.sh` | `install.ps1` |
|---|---|---|
| Charger le projet de démo | `--demo` | `-Demo` |
| Lancer Ollama dans un conteneur (plusieurs Go) | `--ollama` | `-Ollama` |
| Construire les images depuis le dépôt au lieu de les télécharger | `--build` | `-Build` |
| Ne pas ouvrir le navigateur | `--no-browser` | `-NoBrowser` |
| Avec `--build`, garder le cache de construction Docker | `--keep-build-cache` | `-KeepBuildCache` |

Ensuite :

```sh
docker compose up -d           # redémarrer plus tard
docker compose down            # arrêter (les données restent dans les volumes Docker)
docker compose down -v         # arrêter et supprimer toutes les données
docker compose logs -f api     # suivre les journaux de l'API
```

## Premier tour avec la démo

Le projet de démo est une petite boutique en ligne : clients, produits, commandes et
lignes de commande, déjà nettoyés et modélisés.

1. Connectez-vous avec le compte **engineer** : le canvas montre les sources, le
   nettoyage (Silver), le modèle en étoile (Gold) et la diffusion. Un clic ouvre un nœud
   dans l'inspecteur, un double clic sa page.
2. Ouvrez un plan de nettoyage (*Nettoyage*) : chaque règle est expliquée, avec des
   valeurs avant et après.
3. Connectez-vous avec le compte **analyst** et demandez sur l'accueil « Chiffre
   d'affaires par mois en 2024 » : Forja montre ce qu'il a compris, un échantillon, le
   SQL et les contrôles, avant toute publication.

Le [guide engineer](guide-engineer.md) et le [guide analyst](guide-analyst.md) vont plus
loin ; vos fichiers se chargent dans *Sources › Ajouter une source*.

## Réglages

Les réglages vont dans un fichier `.env` à côté de `docker-compose.yml` (voir
[`.env.example`](../.env.example)) ; `docker compose up -d` les applique.

| Réglage | Défaut | Rôle |
|---|---|---|
| `FORJA_WEB_PORT` | 3000 | port de l'interface |
| `FORJA_WEB_BIND` | 127.0.0.1 | `0.0.0.0` pour écouter sur toutes les interfaces (avec HTTPS devant, et `FORJA_WEB_SECURE_COOKIES=true`) |
| `FORJA_AUTH_MODE` | `local` | `multi` pour une instance partagée avec invitations et rôles |
| `FORJA_LLM_PROVIDER` | aucun | `ollama`, `anthropic` ou `openai` (aussi dans l'écran des réglages) |
| `FORJA_DUCKDB_MEMORY_LIMIT` | `auto` | la moitié de la mémoire disponible au démarrage, entre 1 et 16 Go ; ou une taille comme `6GB` |
| `FORJA_VERSION` | `0.1.0` | la version des images |
| `FORJA_IMAGE_PREFIX` | `ghcr.io/forjadata` | un autre registre (un miroir) |

Fournisseurs d'IA et garanties : [README.fr.md](../README.fr.md#fournisseur-dia--local-cloud-ou-aucun)
et [security.md](security.md).

## Mise à jour

```sh
git pull
docker compose pull            # ou : FORJA_VERSION=<version> docker compose pull
docker compose up -d
```

Le catalogue est migré au démarrage, sans perte. Lisez d'abord le
[CHANGELOG](../CHANGELOG.md) : avant la 1.0, une version mineure peut changer un réglage.

## Sauvegarde

Tout tient dans deux volumes Docker : `forja_forja-data` (catalogue, entrepôt, fichiers)
et `forja_forja-secrets` (sels de pseudonymisation, clé de signature, clés des
fournisseurs). Sauvegardez **les deux** : sans les sels, les nouveaux pseudonymes ne
correspondraient plus à ceux déjà publiés.

```sh
docker compose stop
docker run --rm -v forja_forja-data:/data -v forja_forja-secrets:/secrets \
  -v "$PWD":/backup alpine tar czf /backup/forja-backup.tgz /data /secrets
docker compose start
```

## Vérifier les images

Les images sont signées dans GitHub Actions avec cosign (sans clé) et portent des
attestations SBOM et de provenance :

```sh
cosign verify ghcr.io/forjadata/forja-api:0.1.0 \
  --certificate-identity-regexp "^https://github.com/forjadata/forja/" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
```

## Sans Docker

Pour développer, ou lancer l'API et l'interface directement : [uv](https://docs.astral.sh/uv/)
et [pnpm](https://pnpm.io/), voir [development.md](development.md). Sous Windows ARM64,
le Python de uv est x64 et tourne en émulation (certaines dépendances n'ont pas encore
de roue Windows ARM64) : Docker y est plus rapide.

## Dépannage

| Symptôme | Solution |
|---|---|
| « images introuvables » à l'installation | hors ligne, ou registre bloqué : `./install.sh --build` les construit depuis le dépôt |
| Le port 3000 est pris | `FORJA_WEB_PORT=3001 ./install.sh` |
| Un mot de passe de démo est perdu | `docker compose stop api && docker compose run --rm api forja demo --reset-passwords && docker compose start api` en affiche de nouveaux |
| Le mot de passe administrateur est perdu | la 0.1 n'a pas de commande de réinitialisation : sur une installation neuve, repartez de zéro avec `docker compose down -v` (toutes les données perdues) |
| Ollama est injoignable | sous Linux, Ollama doit écouter sur le pont Docker (`OLLAMA_HOST=0.0.0.0`), ou utilisez `--ollama` |
| Un gros fichier sature la machine | baissez `FORJA_DUCKDB_MEMORY_LIMIT` (par exemple `2GB`) : DuckDB déborde sur disque |
