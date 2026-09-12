# SkateHangar

Jeu de skate 3D dans le navigateur, façon Tony Hawk's Pro Skater, sur
une carte : un hangar industriel abritant un skatepark inspiré du
[skatepark de la Barre à Anglet (64)](https://www.jackspots.fr/2012/09/anglet-64.html)
(quarter-pipes qui se font face, funbox central avec rail et escalier,
curbs tout autour, ledge additionnel).

Construit avec [Three.js](https://threejs.org/) (r128) + un petit
serveur Express pour servir les fichiers statiques.

## Lancer le jeu en local

```bash
npm install
npm start
```

Puis ouvre http://localhost:8081 dans ton navigateur.

## Contrôles

- Flèches ou **ZQSD** : rouler / diriger le skateur
- **Espace** : ollie (saut), ou pop-off pour sortir d'un grind
- Approche-toi d'un rail/curb en l'air pour t'accrocher automatiquement
  et grinder
- **R** : réinitialiser la position si tu restes coincé

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

### 1. Transférer le dossier sur le Mac mini

Depuis ce PC :

```bash
scp -r C:\Users\lesma\Github\SkateHangar jussan@mac-mini-de-jussan.tail736807.ts.net:~/
```

(ou récupère directement le dépôt GitHub sur le Mac mini avec
`git clone https://github.com/charlit/PST.git SkateHangar`)

### 2. Lancer le serveur avec Docker

En SSH sur le Mac mini :

```bash
ssh jussan@mac-mini-de-jussan.tail736807.ts.net
cd SkateHangar
colima start --vm-type=vz   # si Colima n'est pas déjà démarré
docker compose up -d --build
```

Vérifie que ça tourne :

```bash
docker compose logs -f
```

Tu dois voir `SkateHangar, écoute sur le port 8081`. Teste en local sur
le Mac mini :

```bash
curl -I http://localhost:8081
```

### 3. Rendre le jeu accessible à tout le monde (Tailscale Funnel)

TrashGO utilise déjà le port HTTPS 443 par défaut sur Tailscale
Funnel. Pour SkateHangar, on expose un deuxième port HTTPS (8443) sur
la même adresse Tailscale :

```bash
sudo tailscale funnel --bg --https=8443 8081
```

Tailscale affiche alors une URL du style :

```
https://mac-mini-de-jussan.tail736807.ts.net:8443/
```

**C'est cette adresse que tu partages** pour SkateHangar (à ne pas
confondre avec l'URL de TrashGO en 443).

Vérifie l'état de tous les partages actifs :

```bash
sudo tailscale funnel status
```

### 4. Mettre à jour le jeu plus tard

```bash
ssh jussan@mac-mini-de-jussan.tail736807.ts.net "cd SkateHangar && git pull && docker compose up -d --build"
```

(si tu as cloné le dépôt Git sur le Mac mini plutôt que transféré via
scp)

## Idées d'améliorations

- Vrais modèles 3D (skateur, planche) au lieu des formes géométriques
  simples actuelles.
- Plus de tricks : grabs, flips, manuals, grind à 50-50/nose/tail avec
  différents scores.
- Système de bail (chute) quand on atterrit mal ou qu'on quitte un
  grind en déséquilibre.
- D'autres cartes / autres skateparks réels comme inspiration.
- Musique et sons (skate roll, ollie, grind).
