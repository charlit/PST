# SkateHangar

Jeu de skate 3D dans le navigateur, façon Tony Hawk's Pro Skater, dans
un style **skate urbain** (béton gris + accents néon), avec toon
shading et contours noirs. La carte reprend l'agencement du
[skatepark de la Barre à Anglet (64)](https://www.jackspots.fr/2012/09/anglet-64.html) :
une plaza en béton, une pyramide/hip centrale avec rail néon sur
l'arête, des quarter-pipes et une rampe banque en béton, un rail isolé
sur pieds métalliques, un ledge, et un **bowl** (piscine creusée) avec
coping néon grindable tout autour — le tout sous un hangar ouvert. Au
loin : une plage avec palmiers, la mer et le soleil d'un côté, un
parking avec quelques voitures de l'autre.

Construit avec [Three.js](https://threejs.org/) (r128, `MeshToonMaterial`
+ contours via `EdgesGeometry`) + un petit serveur Express pour servir
les fichiers statiques.

## Lancer le jeu en local

```bash
npm install
npm start
```

Puis ouvre http://localhost:8081 dans ton navigateur.

## Animation du skateur

Le personnage a un squelette procédural avec de vraies articulations à
deux segments par membre — épaule + coude pour les bras, hanche + genou
pour les jambes (`createLimbChain()`) — animé selon l'état du jeu dans
`animatePlayer()` :

- **En train de rouler** : les hanches pompent en alternance (vitesse
  liée à la vitesse du skateur), les genoux plient davantage du côté
  qui recule, et les bras balancent en opposition.
- **En l'air (ollie)** : hanches et genoux repliés (jambes tuckées),
  bras levés/écartés aux épaules et coudes légèrement pliés.
- **En grind** : position accroupie (hanches + genoux bien pliés),
  bras tendus à l'horizontale de chaque côté pour l'équilibre.

Chaque articulation (hanche, genou, épaule, coude) est un `THREE.Group`
pivot imbriqué dans le précédent, comme un mini rig ; toutes les
transitions sont amorties (lerp) pour rester fluides d'un état à
l'autre plutôt que de changer de pose brutalement.

## Contrôles

- Flèches ou **ZQSD** : rouler / diriger le skateur
- **Espace** : ollie (saut), ou pop-off pour sortir d'un grind
- **X** : figure (kickflip) pendant que tu es en l'air
- Approche-toi d'un rail/curb en l'air pour t'accrocher automatiquement
  et grinder
- **R** : réinitialiser la position si tu restes coincé

## La planche

Le plateau (`buildBoard()`) a une vraie forme de skateboard : nose et
tail relevés (kicks), trucks et roues sous le plateau. Une figure
(**X** en l'air) fait tourner la planche sur elle-même façon kickflip
(`boardFlip`, un groupe séparé de l'inclinaison normale de la planche)
et rapporte des points ; réussie ou non, la planche revient à plat en
douceur.

## Collisions

En plus du raycast de sol (rampes, bowl, pyramide...), les obstacles
compacts — poteaux du hangar, pieds du rail isolé — bloquent
maintenant le joueur horizontalement (`colliders`, résolu dans
`resolveHorizontalCollisions()`) : impossible de les traverser en
roulant. Le blocage ne s'applique qu'en dessous de la hauteur de
l'obstacle, donc sauter par-dessus reste possible.

## Structure

```
SkateHangar/
├── server.js        <- serveur Express (fichiers statiques)
├── package.json
└── public/
    ├── index.html   <- page + UI (score, combo, chrono)
    └── game.js       <- toute la logique du jeu (scène 3D, physique,
                          grind, score, caméra)
```

## Comment fonctionne le jeu (pour la suite)

- **Déplacement** : vitesse + direction (yaw), pas de vraie physique
  de collision latérale — le joueur est limité à la zone du hangar.
- **Sol / rampes** : détecté par un rayon (raycast) lancé vers le bas
  contre tous les objets "roulables" (`rideableMeshes`). Les
  quarter-pipes sont de vraies courbes (géométrie extrudée), donc le
  raycast suit naturellement leur profil.
- **Grind** : une liste de segments (`grindRails`) définit chaque
  rail/curb grindable. Quand le joueur est en l'air et suffisamment
  proche d'un segment, il s'accroche et avance le long du rail.
- **Score / combo** : chaque trick (ollie, grind, réception) ajoute des
  points ; un combo timer augmente le multiplicateur tant que tu
  enchaînes les tricks sans temps mort.

## Héberger sur le Mac mini (Docker + Tailscale Funnel)

Même principe que pour TrashGO, sur un port différent (8081) pour que
les deux jeux tournent en même temps sur le Mac mini.

### 1. Récupérer le code sur le Mac mini

En SSH sur le Mac mini (`ssh jussan@games-carlitos.tail736807.ts.net`) :

```bash
git clone https://github.com/charlit/PST.git SkateHangar
cd SkateHangar
```

### 2. Lancer le serveur avec Docker

```bash
colima start --vm-type=vz   # si Colima n'est pas déjà démarré
docker-compose up -d --build
```

> Sur ce Mac mini, c'est la commande `docker-compose` (avec un tiret)
> qui est installée, pas le plugin `docker compose` intégré — utilise
> bien cette syntaxe.

Vérifie que ça tourne :

```bash
docker-compose logs -f
```

Tu dois voir `SkateHangar, écoute sur le port 8081`. Teste en local sur
le Mac mini :

```bash
curl -I http://localhost:8081
```

### 3. Rendre le jeu accessible à tout le monde (Tailscale Funnel)

TrashGO utilise déjà le port HTTPS 443 par défaut sur Tailscale
Funnel. Pour SkateHangar, on expose un deuxième port HTTPS (8443) sur
la même adresse Tailscale. Sur ce Mac mini, Tailscale est installé via
l'app macOS (pas de commande `tailscale` dans le PATH de `sudo`), donc
il faut passer par le chemin complet :

```bash
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --bg --https=8443 8081
```

Tailscale affiche alors une URL du style :

```
https://games-carlitos.tail736807.ts.net:8443/
```

**C'est cette adresse que tu partages** pour SkateHangar (à ne pas
confondre avec l'URL de TrashGO en 443).

Vérifie l'état de tous les partages actifs :

```bash
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel status
```

Pour couper ce partage :

```bash
sudo /Applications/Tailscale.app/Contents/MacOS/Tailscale funnel --https=8443 off
```

### 4. Mettre à jour le jeu manuellement

Sur le Mac mini, dans le dossier `~/SkateHangar` :

```bash
git pull
docker-compose up -d --build
```

## Déploiement automatique (à chaque push GitHub)

Le script [`deploy/watch-deploy.sh`](deploy/watch-deploy.sh) vérifie
s'il y a du nouveau code sur GitHub et, si oui, fait `git pull` +
reconstruit le conteneur Docker automatiquement. Pour l'activer sur le
Mac mini :

```bash
chmod +x ~/SkateHangar/deploy/watch-deploy.sh
crontab -e
```

Ajoute cette ligne (vérifie toutes les 5 minutes) puis sauvegarde :

```
*/5 * * * * /bin/bash /Users/jussan/SkateHangar/deploy/watch-deploy.sh
```

Les logs du script sont dans `deploy/watch-deploy.log`. Avec ça,
chaque `git push` sur `master` est automatiquement répercuté sur le
Mac mini dans les 5 minutes qui suivent — sans rien faire de plus.

## Idées d'améliorations

- Vrais modèles 3D (skateur, planche) au lieu des formes géométriques
  simples actuelles.
- Plus de tricks : grabs, autres flips, manuals, grind à
  50-50/nose/tail avec différents scores.
- Système de bail (chute) quand on atterrit mal ou qu'on quitte un
  grind en déséquilibre.
- D'autres cartes / autres skateparks réels comme inspiration.
- Musique et sons (skate roll, ollie, grind).
