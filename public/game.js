/* SkateHangar — jeu de skate 3D façon Tony Hawk's Pro Skater
   Carte : un hangar abritant un skatepark inspiré du park de la Barre (Anglet).
   Three.js r128 (global THREE, chargé via <script> dans index.html). */

// ----------------------------- Constantes -----------------------------
const GRAVITY = -28;
const OLLIE_FORCE = 10.5;
const MAX_SPEED = 13;
const ACCEL = 9;
const BRAKE = 14;
const FRICTION = 3.5;
const TURN_RATE = 2.4; // rad/s à pleine vitesse
const GRIND_RADIUS = 0.9;
const GRIND_SNAP_Y = 0.55;
const MATCH_TIME = 120; // secondes
const HALF_W = 22; // limites jouables du hangar (doit correspondre à buildHangar)
const HALF_L = 42;

// Bowl (piscine creusée) : position et dimensions, utilisées à la fois pour
// découper le trou dans le sol et pour construire la géométrie du bowl.
const BOWL_X = 0;
const BOWL_Z = -36;
const BOWL_RADIUS = 6;
const BOWL_DEPTH = 2.6;

// Palette "skate urbain" : béton gris pour les surfaces, accents néon sur les
// rails/copings uniquement.
const COLORS = {
  sky: 0x9fb4c4,
  asphalt: 0x4b5259,
  plaza: 0xd6d1c4,
  plazaBorder: 0x33383d,
  concreteLight: 0xbdb8ac,
  concreteMid: 0xa6a19a,
  concreteDark: 0x8d8983,
  neonRed: 0xff3b3b,
  neonYellow: 0xffe14d,
  neonCyan: 0x2fe6e6,
  metalLight: 0xd7dbe0,
  metalDark: 0x2f333a,
};

// ----------------------------- État global -----------------------------
let scene, camera, renderer, clock;
let player, board;
let rideableMeshes = [];
let grindRails = []; // { a: Vector3, b: Vector3 } (y déjà inclus dans a/b)

const state = {
  pos: new THREE.Vector3(0, 0.4, 10),
  vy: 0,
  speed: 0,
  yaw: 0,
  grounded: false,
  grinding: null, // { a, b, t, dir }
  comboCount: 0,
  comboTimer: 0,
  score: 0,
  timeLeft: MATCH_TIME,
  over: false,
};

const keys = {};

// ----------------------------- Style cartoon (toon shading + contours) -----------------------------
let toonGradient = null;

function getToonGradient() {
  if (toonGradient) return toonGradient;
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  // 4 bandes de lumière franches, façon cel-shading
  const shades = [90, 150, 205, 255];
  shades.forEach((v, i) => {
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(i, 0, 1, 1);
  });
  toonGradient = new THREE.CanvasTexture(canvas);
  toonGradient.magFilter = THREE.NearestFilter;
  toonGradient.minFilter = THREE.NearestFilter;
  toonGradient.generateMipmaps = false;
  return toonGradient;
}

function toonMat(color, extra) {
  return new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: getToonGradient() }, extra));
}

// Ajoute un contour noir façon bande-dessinée autour d'un mesh (silhouette figée dans sa géométrie).
function addOutline(mesh, color = 0x1a1a2e) {
  const edges = new THREE.EdgesGeometry(mesh.geometry, 28);
  const outline = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color }));
  mesh.add(outline);
  return mesh;
}

// Raccourci : crée un mesh avec matériau toon + ombres + contour, prêt à ajouter à la scène.
function toonMesh(geometry, color, extra) {
  const mesh = new THREE.Mesh(geometry, toonMat(color, extra));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  addOutline(mesh);
  return mesh;
}

// ----------------------------- Init -----------------------------
init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 40, 95);

  camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 200);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  document.body.appendChild(renderer.domElement);

  clock = new THREE.Clock();

  buildLights();
  buildHangar();
  buildSkatepark();
  buildPlayer();

  window.addEventListener("resize", onResize);
  window.addEventListener("keydown", (e) => (keys[e.code] = true));
  window.addEventListener("keyup", (e) => (keys[e.code] = false));
  document.getElementById("retry").addEventListener("click", resetGame);

  resetGame();
}

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// ----------------------------- Décor : le hangar -----------------------------
function buildLights() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff8e7, 1.15);
  sun.position.set(20, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  scene.add(sun);

  const fill = new THREE.PointLight(0xffd166, 0.35, 60);
  fill.position.set(-15, 12, -15);
  scene.add(fill);
}

function buildHangar() {
  // Sol : une plaza béton, avec un vrai trou découpé dans la géométrie à
  // l'emplacement du bowl (sinon le sol plat masquerait le bowl au raycast).
  const floorTexture = createFloorTexture();
  const floorMat = new THREE.MeshToonMaterial({ map: floorTexture, gradientMap: getToonGradient() });

  const floorShape = new THREE.Shape();
  floorShape.moveTo(-HALF_W, -HALF_L);
  floorShape.lineTo(HALF_W, -HALF_L);
  floorShape.lineTo(HALF_W, HALF_L);
  floorShape.lineTo(-HALF_W, HALF_L);
  floorShape.lineTo(-HALF_W, -HALF_L);
  const bowlHole = new THREE.Path();
  // Le Y local du Shape correspond à -Z une fois la géométrie posée à plat
  // (rotation.x = -PI/2) — on compense pour aligner le trou sur BOWL_Z.
  bowlHole.absarc(BOWL_X, -BOWL_Z, BOWL_RADIUS, 0, Math.PI * 2, false);
  floorShape.holes.push(bowlHole);

  const floor = new THREE.Mesh(new THREE.ShapeGeometry(floorShape, 64), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  rideableMeshes.push(floor);

  // Structure de hangar ouverte façon auvent : juste les poteaux/arches, pas de
  // murs pleins, pour laisser le ciel et le décor bien visibles.
  const wallHeight = 14;
  const archCount = 8;
  for (let i = 0; i <= archCount; i++) {
    const z = -HALF_L + (i / archCount) * HALF_L * 2;

    // Poteaux verticaux de chaque côté
    [-HALF_W, HALF_W].forEach((x) => {
      const post = toonMesh(new THREE.CylinderGeometry(0.35, 0.35, wallHeight, 10), COLORS.metalDark);
      post.position.set(x, wallHeight / 2, z);
      scene.add(post);
    });

    // Arche du toit (ligne fine, purement décorative, accent néon)
    const archShape = new THREE.Shape();
    const segs = 16;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const ang = Math.PI * t;
      const x = -Math.cos(ang) * HALF_W;
      const y = wallHeight + Math.sin(ang) * 9;
      if (s === 0) archShape.moveTo(x, y);
      else archShape.lineTo(x, y);
    }
    const points = archShape.getPoints();
    const archGeom = new THREE.BufferGeometry().setFromPoints(
      points.map((p) => new THREE.Vector3(p.x, p.y, 0))
    );
    const arch = new THREE.Line(archGeom, new THREE.LineBasicMaterial({ color: COLORS.neonYellow, linewidth: 2 }));
    arch.position.z = z;
    scene.add(arch);
  }

  // Toit très légèrement teinté, surtout pour l'ombrage — le ciel reste visible
  const roofMat = new THREE.MeshBasicMaterial({
    color: 0xdfe7ec,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
  });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(HALF_W, HALF_W, HALF_L * 2, 24, 1, true, 0, Math.PI), roofMat);
  roof.rotation.z = Math.PI / 2;
  roof.rotation.y = Math.PI / 2;
  roof.position.set(0, wallHeight, 0);
  scene.add(roof);

  buildBackgroundScenery();
}

// Peint la plaza béton + la bordure sur un canvas, utilisé comme texture du
// sol — évite les faux-raccords entre plusieurs meshes.
function createFloorTexture() {
  const pxPerUnit = 10;
  const w = HALF_W * 2 * pxPerUnit;
  const h = HALF_L * 2 * pxPerUnit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  // Asphalte tout autour
  ctx.fillStyle = "#4b5259";
  ctx.fillRect(0, 0, w, h);
  // Petits éclats plus clairs (grain d'asphalte)
  ctx.fillStyle = "#565e66";
  for (let i = 0; i < 300; i++) {
    const rx = Math.random() * w;
    const ry = Math.random() * h;
    ctx.fillRect(rx, ry, 10, 2);
  }

  // Bordure de la plaza (foncée) puis plaza béton clair par-dessus
  const cx = w / 2;
  const cy = h / 2;
  const rx = HALF_W * pxPerUnit - 55;
  const ry = HALF_L * pxPerUnit - 70;

  ctx.fillStyle = "#33383d";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx + 14, ry + 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#d6d1c4";
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

// Décor lointain visible à travers l'ouverture du hangar : arbres et
// immeubles stylisés en fond, dans des tons discrets.
function buildBackgroundScenery() {
  const trunkMat = toonMat(0x5b4636);
  for (let i = 0; i < 10; i++) {
    const x = (Math.random() - 0.5) * (HALF_W * 2 + 30);
    const z = -HALF_L - 15 - Math.random() * 20;
    const scale = 0.8 + Math.random() * 0.9;

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2 * scale, 6), trunkMat);
    trunk.position.set(x, scale, z);
    scene.add(trunk);

    const foliage = toonMesh(new THREE.SphereGeometry(1.4 * scale, 8, 8), 0x4f7942);
    foliage.position.set(x, 2.6 * scale, z);
    scene.add(foliage);
  }

  const buildingMat = [0xd7dbe0, 0x8a94a6, 0xb8bcc2];
  for (let i = 0; i < 5; i++) {
    const x = (Math.random() - 0.5) * (HALF_W * 2 + 10);
    const z = -HALF_L - 25 - Math.random() * 15;
    const height = 5 + Math.random() * 6;
    const building = toonMesh(
      new THREE.BoxGeometry(4 + Math.random() * 2, height, 4),
      buildingMat[i % buildingMat.length]
    );
    building.position.set(x, height / 2, z);
    scene.add(building);
  }
}

// ----------------------------- Skatepark (inspiré du park d'Anglet, style cartoon) -----------------------------
function buildSkatepark() {
  // Pyramide centrale (hip à 4 pans) avec rail sur l'arête du sommet — la pièce
  // signature du park d'Anglet, en béton avec un rail néon jaune.
  const pyramidTop = 1.6;
  const pyramidHeight = 2.2;
  const pyramidCenter = new THREE.Vector3(0, 0, -6);
  const pyramid = createPyramidHip(5, pyramidTop, pyramidHeight, COLORS.concreteLight);
  pyramid.position.copy(pyramidCenter);
  scene.add(pyramid);
  rideableMeshes.push(pyramid);

  // Rail le long de l'arête du sommet qui fait face au spawn (+Z), pour une
  // ligne d'approche naturelle en arrivant depuis le départ.
  const apothem = (pyramidTop / 2) * Math.cos(Math.PI / 4);
  const railY = pyramidHeight + 0.1;
  const railZ = pyramidCenter.z + apothem;
  addGrindRail(
    new THREE.Vector3(pyramidCenter.x - apothem, railY, railZ),
    new THREE.Vector3(pyramidCenter.x + apothem, railY, railZ),
    COLORS.neonYellow
  );

  // Quarter-pipe béton côté gauche
  const qpLeft = createQuarterPipe(3.4, 7, COLORS.concreteMid);
  qpLeft.rotation.y = Math.PI / 2;
  qpLeft.position.set(-16, 0, -16);
  scene.add(qpLeft);
  rideableMeshes.push(qpLeft);

  // Rampe banque (wedge) béton côté droit
  const wedgeRight = createWedgeRamp(3.2, 3.2, 7, COLORS.concreteDark);
  wedgeRight.rotation.y = -Math.PI / 2;
  wedgeRight.position.set(15, 0, -15);
  scene.add(wedgeRight);
  rideableMeshes.push(wedgeRight);

  // Quarter-pipe béton près du spawn, pour prendre de l'air en arrivant
  const qpSpawn = createQuarterPipe(3.6, 8, COLORS.concreteLight);
  qpSpawn.rotation.y = Math.PI;
  qpSpawn.position.set(0, 0, 18);
  scene.add(qpSpawn);
  rideableMeshes.push(qpSpawn);

  // Rail isolé sur pieds métalliques (comme le rail "table" vu sur les photos)
  buildStandaloneRail(new THREE.Vector3(-9, 0, 6), new THREE.Vector3(-2, 0, 6), COLORS.neonCyan);

  // Petit ledge bas à droite, pour varier les lignes de grind
  const ledgeHeight = 0.55;
  const ledge = toonMesh(new THREE.BoxGeometry(7, ledgeHeight, 1.4), COLORS.concreteMid);
  ledge.position.set(9, ledgeHeight / 2, 8);
  scene.add(ledge);
  rideableMeshes.push(ledge);
  addGrindRail(
    new THREE.Vector3(5.6, ledgeHeight + 0.1, 8),
    new THREE.Vector3(12.4, ledgeHeight + 0.1, 8),
    COLORS.neonRed
  );

  buildBowl();
}

// Bowl (piscine creusée) : un profil de révolution (fond plat + paroi
// courbe qui rejoint le sol à la verticale) avec un coping néon grindable
// tout autour du rebord.
function buildBowl() {
  const flatRadius = Math.max(BOWL_RADIUS - BOWL_DEPTH, 0.6);
  const wallRun = BOWL_RADIUS - flatRadius;
  const points = [new THREE.Vector2(0, -BOWL_DEPTH), new THREE.Vector2(flatRadius, -BOWL_DEPTH)];

  const wallSegs = 14;
  for (let i = 1; i <= wallSegs; i++) {
    const t = i / wallSegs;
    const x = t * wallRun;
    const y = wallRun - Math.sqrt(Math.max(wallRun * wallRun - x * x, 0));
    points.push(new THREE.Vector2(flatRadius + x, -BOWL_DEPTH + y));
  }

  const bowlGeom = new THREE.LatheGeometry(points, 48);
  // DoubleSide : les normales du Lathe pointent vers l'intérieur du bol, il
  // faut donc rendre (et pouvoir raycaster) les deux faces.
  const bowl = toonMesh(bowlGeom, COLORS.concreteMid, { side: THREE.DoubleSide });
  bowl.position.set(BOWL_X, 0, BOWL_Z);
  scene.add(bowl);
  rideableMeshes.push(bowl);

  // Coping néon autour du rebord, approximé par des segments de grind droits
  const copingSegs = 20;
  for (let i = 0; i < copingSegs; i++) {
    const a1 = (i / copingSegs) * Math.PI * 2;
    const a2 = ((i + 1) / copingSegs) * Math.PI * 2;
    addGrindRail(
      new THREE.Vector3(BOWL_X + Math.cos(a1) * BOWL_RADIUS, 0.12, BOWL_Z + Math.sin(a1) * BOWL_RADIUS),
      new THREE.Vector3(BOWL_X + Math.cos(a2) * BOWL_RADIUS, 0.12, BOWL_Z + Math.sin(a2) * BOWL_RADIUS),
      COLORS.neonRed
    );
  }

  // Anneau visuel du coping (tube fin qui souligne le rebord)
  const copingRing = toonMesh(new THREE.TorusGeometry(BOWL_RADIUS, 0.09, 8, copingSegs), COLORS.neonRed);
  copingRing.rotation.x = Math.PI / 2;
  copingRing.position.set(BOWL_X, 0.12, BOWL_Z);
  scene.add(copingRing);
}

// Rampe "quarter-pipe" par extrusion d'un profil courbe (transition tangente au sol).
function createQuarterPipe(radius, width, color) {
  const backDepth = 0.6;
  const segs = 14;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  for (let i = 0; i <= segs; i++) {
    const x = (i / segs) * radius;
    const y = radius - Math.sqrt(Math.max(radius * radius - x * x, 0));
    shape.lineTo(x, y);
  }
  shape.lineTo(radius, -backDepth);
  shape.lineTo(0, -backDepth);
  shape.lineTo(0, 0);

  const geom = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geom.translate(-radius / 2, 0, -width / 2); // centre la géométrie
  return toonMesh(geom, color);
}

// Rampe "banque" simple (plan incliné droit), pour varier avec les quarter-pipes courbes.
function createWedgeRamp(radius, height, width, color) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(radius, height);
  shape.lineTo(radius, 0);
  shape.lineTo(0, 0);

  const geom = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  geom.translate(-radius / 2, 0, -width / 2);
  return toonMesh(geom, color);
}

// Pyramide/hip à 4 pans plats (frustum carré) avec un petit plateau au sommet.
function createPyramidHip(baseSize, topSize, height, color) {
  const geom = new THREE.CylinderGeometry(topSize / 2, baseSize / 2, height, 4, 1, false);
  geom.translate(0, height / 2, 0); // pose la base au sol (y=0) au lieu d'être centrée
  const mesh = toonMesh(geom, color);
  mesh.rotation.y = Math.PI / 4; // aligne les faces plates sur les axes X/Z
  return mesh;
}

function buildStandaloneRail(a, b, color = COLORS.neonCyan) {
  const railHeight = 0.9;

  // Deux pieds façon tréteau, aux extrémités
  [a, b].forEach((p) => {
    const leg = toonMesh(new THREE.BoxGeometry(0.18, railHeight, 0.5), COLORS.metalDark);
    leg.position.set(p.x, railHeight / 2, p.z);
    scene.add(leg);
  });

  addGrindRail(
    new THREE.Vector3(a.x, railHeight, a.z),
    new THREE.Vector3(b.x, railHeight, b.z),
    color
  );
}

function addGrindRail(a, b, color = COLORS.metalLight) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);

  const rail = toonMesh(new THREE.CylinderGeometry(0.08, 0.08, len, 8), color);
  rail.position.copy(mid);
  rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  scene.add(rail);

  grindRails.push({ a: a.clone(), b: b.clone() });
}

// ----------------------------- Le skateur -----------------------------
function buildPlayer() {
  player = new THREE.Group();

  const body = toonMesh(new THREE.CylinderGeometry(0.28, 0.28, 1.0, 10), COLORS.metalDark);
  body.position.y = 0.75;
  player.add(body);

  const head = toonMesh(new THREE.SphereGeometry(0.24, 10, 10), 0xffe3c2);
  head.position.y = 1.4;
  player.add(head);

  board = toonMesh(new THREE.BoxGeometry(0.5, 0.08, 1.7), COLORS.neonRed);
  board.position.y = 0.24;
  player.add(board);

  scene.add(player);
}

// ----------------------------- Boucle de jeu -----------------------------
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!state.over) {
    update(dt);
  }
  renderer.render(scene, camera);
}

function update(dt) {
  handleInput(dt);
  if (state.grinding) {
    updateGrind(dt);
  } else {
    updatePhysics(dt);
    tryStartGrind();
  }
  updateCombo(dt);
  updatePlayerTransform();
  updateCamera(dt);
  updateTimer(dt);
  updateUI();
}

function handleInput(dt) {
  const forward = keys["ArrowUp"] || keys["KeyW"] || keys["KeyZ"];
  const backward = keys["ArrowDown"] || keys["KeyS"];
  const left = keys["ArrowLeft"] || keys["KeyA"] || keys["KeyQ"];
  const right = keys["ArrowRight"] || keys["KeyD"];

  if (!state.grinding) {
    if (forward) state.speed = Math.min(state.speed + ACCEL * dt, MAX_SPEED);
    else if (backward) state.speed = Math.max(state.speed - BRAKE * dt, -MAX_SPEED * 0.5);
    else {
      const sign = Math.sign(state.speed);
      state.speed -= sign * FRICTION * dt;
      if (Math.sign(state.speed) !== sign) state.speed = 0;
    }

    const turnFactor = Math.min(Math.abs(state.speed) / MAX_SPEED + 0.25, 1);
    if (left) state.yaw += TURN_RATE * turnFactor * dt;
    if (right) state.yaw -= TURN_RATE * turnFactor * dt;
  }

  if (keys["Space"]) {
    keys["Space"] = false; // évite le saut multiple en maintenant la touche
    if (state.grinding) {
      endGrind(true);
    } else if (state.grounded) {
      state.vy = OLLIE_FORCE;
      state.grounded = false;
      addScore(100, "OLLIE !");
    }
  }

  if (keys["KeyR"]) {
    keys["KeyR"] = false;
    respawn();
  }
}

function updatePhysics(dt) {
  // Déplacement horizontal selon le cap (yaw)
  const dx = Math.sin(state.yaw) * state.speed * dt;
  const dz = Math.cos(state.yaw) * state.speed * dt;
  state.pos.x += dx;
  state.pos.z += dz;

  // Empêche de sortir de la zone jouable du hangar (pas de mur physique pour l'instant)
  const margin = 1;
  state.pos.x = THREE.MathUtils.clamp(state.pos.x, -HALF_W + margin, HALF_W - margin);
  state.pos.z = THREE.MathUtils.clamp(state.pos.z, -HALF_L + margin, HALF_L - margin);

  // Gravité
  state.vy += GRAVITY * dt;
  state.pos.y += state.vy * dt;

  // Détection du sol par raycast vers le bas
  const groundY = raycastGround(state.pos.x, state.pos.z, state.pos.y + 6);
  if (groundY !== null && state.pos.y <= groundY + 0.05) {
    if (state.vy <= 0) {
      const wasAirborne = !state.grounded;
      state.pos.y = groundY;
      state.vy = 0;
      state.grounded = true;
      if (wasAirborne && state.comboCount > 0) {
        addScore(50 * state.comboCount, "LANDÉ !");
      }
    }
  } else {
    state.grounded = false;
  }

  if (state.pos.y < -20) respawn();
}

function raycastGround(x, z, fromY) {
  const origin = new THREE.Vector3(x, fromY, z);
  const raycaster = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 20);
  const hits = raycaster.intersectObjects(rideableMeshes, false);
  return hits.length ? hits[0].point.y : null;
}

function tryStartGrind() {
  if (state.grounded) return; // on grinde en l'air / en frôlant le rail, pas en roulant au sol
  for (const rail of grindRails) {
    const closest = closestPointOnSegment(state.pos, rail.a, rail.b);
    const horizDist = Math.hypot(closest.x - state.pos.x, closest.z - state.pos.z);
    const vertDist = state.pos.y - closest.y;
    if (horizDist < GRIND_RADIUS && vertDist > -0.2 && vertDist < GRIND_SNAP_Y && state.vy <= 1) {
      startGrind(rail);
      return;
    }
  }
}

function startGrind(rail) {
  const dir = new THREE.Vector3().subVectors(rail.b, rail.a).normalize();
  const toPlayer = new THREE.Vector3().subVectors(state.pos, rail.a);
  const len = rail.a.distanceTo(rail.b);
  let t = toPlayer.dot(dir) / len;
  t = THREE.MathUtils.clamp(t, 0, 1);

  // On grinde dans le sens où le skateur se dirige déjà
  const forwardDir = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
  const sign = forwardDir.dot(dir) >= 0 ? 1 : -1;

  state.grinding = { a: rail.a, b: rail.b, t, sign, len };
  state.vy = 0;
  state.speed = Math.max(Math.abs(state.speed), 6);
  addScore(75, "GRIND !");
}

function updateGrind(dt) {
  const g = state.grinding;
  g.t += (g.sign * Math.abs(state.speed) * dt) / g.len;

  if (g.t <= 0 || g.t >= 1) {
    endGrind(false);
    return;
  }

  const p = new THREE.Vector3().lerpVectors(g.a, g.b, g.t);
  state.pos.x = p.x;
  state.pos.z = p.z;
  state.pos.y = p.y;

  const dir = new THREE.Vector3().subVectors(g.b, g.a).normalize().multiplyScalar(g.sign);
  state.yaw = Math.atan2(dir.x, dir.z);

  addScore(120 * dt, null); // score continu pendant le grind (silencieux, pas de bannière à chaque frame)
}

function endGrind(popOff) {
  state.grinding = null;
  state.grounded = false;
  state.vy = popOff ? OLLIE_FORCE * 0.8 : 2;
  if (popOff) addScore(50, "POP OUT !");
}

function closestPointOnSegment(p, a, b) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const t = THREE.MathUtils.clamp(
    new THREE.Vector3().subVectors(p, a).dot(ab) / ab.lengthSq(),
    0,
    1
  );
  return new THREE.Vector3().copy(a).add(ab.multiplyScalar(t));
}

function updateCombo(dt) {
  if (state.comboTimer > 0) {
    state.comboTimer -= dt;
    if (state.comboTimer <= 0) state.comboCount = 0;
  }
}

function addScore(amount, banner) {
  state.score += amount;
  if (banner) {
    state.comboCount += 1;
    state.comboTimer = 2.5;
    showBanner(banner);
  }
}

function updatePlayerTransform() {
  player.position.copy(state.pos);
  player.rotation.y = state.yaw;
  const lean = state.grinding ? 0 : THREE.MathUtils.clamp(-state.vy * 0.03, -0.4, 0.4);
  board.rotation.x = lean;
}

function updateCamera(dt) {
  const behind = new THREE.Vector3(
    -Math.sin(state.yaw) * 7,
    3.2,
    -Math.cos(state.yaw) * 7
  );
  const desired = new THREE.Vector3().copy(state.pos).add(behind);
  camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
  const lookTarget = new THREE.Vector3().copy(state.pos).add(new THREE.Vector3(0, 1.2, 0));
  camera.lookAt(lookTarget);
}

function updateTimer(dt) {
  if (state.timeLeft <= 0) return;
  state.timeLeft -= dt;
  if (state.timeLeft <= 0) {
    state.timeLeft = 0;
    endGame();
  }
}

function updateUI() {
  document.getElementById("score").textContent = Math.floor(state.score);
  document.getElementById("timer").textContent = Math.ceil(state.timeLeft);
  const comboEl = document.getElementById("combo");
  comboEl.textContent = state.comboCount > 0 ? `Combo x${state.comboCount}` : "";
}

let bannerTimeout = null;
function showBanner(text) {
  const el = document.getElementById("banner");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => el.classList.remove("show"), 700);
}

function respawn() {
  state.pos.set(0, 3, 10);
  state.vy = 0;
  state.speed = 0;
  state.grinding = null;
  state.comboCount = 0;
  state.comboTimer = 0;
}

function endGame() {
  state.over = true;
  document.getElementById("finalscore").textContent = Math.floor(state.score);
  document.getElementById("gameover").style.display = "flex";
}

function resetGame() {
  state.score = 0;
  state.timeLeft = MATCH_TIME;
  state.over = false;
  state.yaw = Math.PI;
  respawn();
  document.getElementById("gameover").style.display = "none";
}
