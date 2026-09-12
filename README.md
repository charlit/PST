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

## Idées d'améliorations

- Vrais modèles 3D (skateur, planche) au lieu des formes géométriques
  simples actuelles.
- Plus de tricks : grabs, flips, manuals, grind à 50-50/nose/tail avec
  différents scores.
- Système de bail (chute) quand on atterrit mal ou qu'on quitte un
  grind en déséquilibre.
- D'autres cartes / autres skateparks réels comme inspiration.
- Musique et sons (skate roll, ollie, grind).
